import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
  Image,
  SafeAreaView,
  FlatList,
  TextInput,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import { GoogleSignin, GoogleSigninButton, statusCodes } from '@react-native-google-signin/google-signin'; // CORRECTED IMPORT PATH
import * as Location from 'expo-location';

// Import navigation components
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';

// Import Stripe Provider
import { StripeProvider } from '@stripe/stripe-react-native';

// Import Socket.IO client
import io from 'socket.io-client';

// Import types from the new types.ts file
import { RootStackParamList, User } from './types';

// Import your screens (ensure these paths are correct relative to App.tsx)
import WelcomeScreen from './screens/WelcomeScreen';
import SignUpScreen from './screens/SignUpScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import VenueDetailScreen from './screens/VenueDetailScreen';
import AdminDashboardScreen from './screens/AdminDashboardScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import TokenScreen from './screens/TokenScreen';
import PayForTableScreen from './screens/PayForTableScreen';

// Import the existing HeaderRight component
import HeaderRight from './components/HeaderRight';


// Create the stack navigator
const Stack = createStackNavigator<RootStackParamList>();

// Backend base URL
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

// --- Main App Component ---
const App = (): JSX.Element => {
  const [initializing, setInitializing] = useState<boolean>(true);
  const [user, setUser] = useState<User>(null); // Use the new User type
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);
  const [pendingNotification, setPendingNotification] = useState<any | null>(null);
  const isAuthProcessing = useRef(false);
  const socketRef = useRef<any>(null); // Ref to hold the socket instance

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '47513412219-hsvcpm1h7f3kusd42sk31i89ilv7lk94.apps.googleusercontent.com',
      iosClientId: '47513412219-s7h2uea77hgadicf5kti86rl6aifobg9.googleusercontent.com',
      scopes: ['email', 'profile'],
    });
    console.log('[GoogleSignin] Configured');
  }, []);

  const requestUserPermissionAndGetToken = useCallback(async () => {
    console.log('[FCM_DEBUG] Attempting to request notification permissions.');
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      console.log('[FCM_DEBUG] Notification Authorization status:', authStatus);

      if (enabled) {
        console.log('[FCM_DEBUG] Permissions granted. Registering device for remote messages...');
        await messaging().registerDeviceForRemoteMessages();
        console.log('[FCM_DEBUG] Device registered for remote messages.');

        try {
          const fcmToken = await messaging().getToken();
          console.log('[FCM_DEBUG] FCM Token obtained:', fcmToken);
          return fcmToken;
        } catch (tokenError) {
          console.error('[FCM_DEBUG] Error getting FCM token:', tokenError);
          return null;
        }
      } else {
        console.log('[FCM_DEBUG] User denied notification permissions or permissions not granted.');
        return null;
      }
    } catch (permissionError) {
      console.error('[FCM_DEBUG] Error requesting notification permission:', permissionError);
      return null;
    }
  }, []);

  const sendFcmTokenToBackend = useCallback(async (uid: string, token: string, idToken: string) => {
    console.log('[FCM_DEBUG] Attempting to send FCM token to backend for user:', uid);
    const url = `${BACKEND_BASE_URL}/api/user/update-fcm-token`;
    console.log('[FCM_DEBUG] Sending FCM token to URL:', url);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ fcmToken: token }),
      });

      const textResponse = await response.text();
      console.log('[FCM_DEBUG] Raw backend response:', textResponse);

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = JSON.parse(textResponse);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Server responded with non-JSON error: ${textResponse.substring(0, 200)}...`;
        }
        console.error(`[FCM_DEBUG] Failed to send FCM token to backend: ${errorMessage}`);
      } else {
        const data = JSON.parse(textResponse);
        console.log('[FCM_DEBUG] FCM token sent to backend successfully:', data.message);
      }
    } catch (error) {
      console.error('[FCM_DEBUG] Network error sending FCM token:', error);
    }
  }, []);

  useEffect(() => {
    console.log('[FCM_DEBUG] Setting up onMessage listener for foreground notifications.');
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('[FCM_DEBUG] FCM Message received in foreground:', JSON.stringify(remoteMessage, null, 2));
      Alert.alert(
        remoteMessage.notification?.title || 'New Notification',
        remoteMessage.notification?.body || 'You have a new message.'
      );
    });

    return () => {
      console.log('[FCM_DEBUG] Cleaning up onMessage listener.');
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribeOnNotificationOpenedApp = messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('[FCM_DEBUG] Notification caused app to open from background state:', JSON.stringify(remoteMessage, null, 2));
      setPendingNotification(remoteMessage);
    });

    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage) {
        console.log('[FCM_DEBUG] Notification caused app to open from quit state:', JSON.stringify(remoteMessage, null, 2));
        setPendingNotification(remoteMessage);
      }
    });

    return () => {
      unsubscribeOnNotificationOpenedApp();
    };
  }, []);

  const clearPendingNotification = useCallback(() => {
    setPendingNotification(null);
  }, []);

  const syncUserWithBackend = useCallback(async (firebaseUser: FirebaseAuthTypes.User) => {
    try {
      const idToken = await firebaseUser.getIdToken(true);
      console.log('[User Sync] Attempting to sync user profile with backend.');
      const response = await fetch(`${BACKEND_BASE_URL}/api/user/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sync user profile.');
      }

      const syncData = await response.json();
      console.log('[User Sync] User synced successfully:', syncData.user);
      return syncData.user;
    } catch (error: any) {
      console.error('[User Sync Error]', error);
      Alert.alert('User Sync Error', `Could not sync user profile: ${error.message}.`);
      return null;
    }
  }, []);


  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseAuthTypes.User) => {
    setIsProfileLoading(true);
    try {
      const idToken = await firebaseUser.getIdToken(true);
      console.log('[Firebase] User ID Token (first 20 chars):', idToken.substring(0, 20) + '...');

      const response = await fetch(`${BACKEND_BASE_URL}/api/user/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch user profile.');
      }

      const profileData = await response.json();
      console.log('[Backend] User Profile Data:', profileData);
      return profileData;
    } catch (error) {
      console.error('[Fetch User Profile Error]', error);
      Alert.alert('Profile Fetch Error', `Could not load user profile: ${error.message}. You might not have a profile in the backend database.`);
      return { isAdmin: false, tokenBalance: 0 };
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  // Refined onAuthStateChanged to be more robust
  const onAuthStateChanged = useCallback(async (firebaseUserFromAuthEvent: FirebaseAuthTypes.User | null) => {
    console.log(`[AUTH_DEBUG_MAIN] onAuthStateChanged invoked. Event user: ${firebaseUserFromAuthEvent ? firebaseUserFromAuthEvent.uid : 'null'}. Initializing: ${initializing}. isAuthProcessing: ${isAuthProcessing.current}`);

    // If already processing, skip to prevent redundant calls/race conditions
    if (isAuthProcessing.current) {
        console.log('[AUTH_DEBUG_MAIN] Already processing an auth state change. Skipping redundant call.');
        return;
    }

    isAuthProcessing.current = true; // Set flag to indicate processing

    try {
      // Use firebaseUserFromAuthEvent as the primary source for authentication status.
      // auth().currentUser can be used to get the *latest* instance if needed,
      // but the event parameter tells us if a user is currently authenticated.
      const liveFirebaseUser = auth().currentUser;

      if (firebaseUserFromAuthEvent && liveFirebaseUser) { // Ensure both are present
        console.log('[AUTH_DEBUG_MAIN] Firebase user from auth event and live user are present. Proceeding with sync and profile fetch.');
        console.log(`[AUTH_DEBUG_MAIN] Live auth().currentUser: ${liveFirebaseUser.uid}`);

        // Step 1: Sync user with backend (ensures MongoDB document exists/is updated)
        const syncedUser = await syncUserWithBackend(liveFirebaseUser);
        if (!syncedUser) {
          throw new Error('Failed to sync user with backend.');
        }

        // Step 2: Fetch full user profile from backend (gets latest tokenBalance, isAdmin, etc.)
        const profile = await fetchUserProfile(liveFirebaseUser);
        if (!profile) {
          throw new Error('Failed to fetch user profile after sync.');
        }

        // Create the User object to store in state, explicitly holding the original Firebase user object
        const userToSet: User = {
          firebaseAuthUser: liveFirebaseUser, // Store the original Firebase user object
          isAdmin: profile.isAdmin,
          tokenBalance: profile.tokenBalance,
          stripeCustomerId: profile.stripeCustomerId,
        };

        console.log(`[AUTH_DEBUG_MAIN] Setting user state. New tokenBalance: ${userToSet.tokenBalance}`);
        console.log(`[AUTH_DEBUG_MAIN] Type of userToSet: ${typeof userToSet}`);
        console.log(`[AUTH_DEBUG_MAIN] Does userToSet.firebaseAuthUser have getIdToken? ${typeof userToSet.firebaseAuthUser.getIdToken}`);

        setUser(userToSet); // Set the new User object

        // Step 3: Send FCM token to backend
        const fcmToken = await requestUserPermissionAndGetToken();
        if (fcmToken) {
          await sendFcmTokenToBackend(liveFirebaseUser.uid, fcmToken, await liveFirebaseUser.getIdToken(true));
        }
        console.log('[AUTH_DEBUG_MAIN] Profile, FCM, and sync process completed for existing user.');

      } else {
        // If firebaseUserFromAuthEvent is null, it means no user is authenticated.
        console.log('[AUTH_DEBUG_MAIN] Firebase user from auth event or live user is null. Setting user to null.');
        setUser(null);
      }
    } catch (error) {
      console.error('[AUTH_DEBUG_MAIN] Error during auth state processing:', error);
      setUser(null); // Ensure user is cleared on error
      Alert.alert('Authentication Error', 'Failed to process authentication. Please try again.');
    } finally {
      if (initializing) {
        setInitializing(false);
        console.log('[AUTH_DEBUG_MAIN] setInitializing(false) called.');
      }
      isAuthProcessing.current = false; // Reset flag
      console.log('[AUTH_DEBUG_MAIN] Auth state processing finished. isAuthProcessing set to false.');
    }
  }, [initializing, syncUserWithBackend, fetchUserProfile, requestUserPermissionAndGetToken, sendFcmTokenToBackend]);

  useEffect(() => {
    console.log('[AUTH_DEBUG_EFFECT] Setting up auth state listener.');
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return () => {
      console.log('[AUTH_DEBUG_EFFECT] Cleaning up auth state listener.');
      subscriber();
    };
  }, [onAuthStateChanged]); // Dependency array includes onAuthStateChanged

  // Socket.IO connection and listener for token updates
  useEffect(() => {
    // Check if user (wrapper object) and firebaseAuthUser (actual Firebase object) exist
    console.log(`[Socket.IO Effect] Running. User: ${user?.firebaseAuthUser?.uid}, socketRef.current: ${socketRef.current ? 'exists' : 'null'}`);

    // Cleanup existing socket connection if it exists or if user logs out
    if (socketRef.current && (!user || !user.firebaseAuthUser?.uid)) {
      console.log('[Socket.IO Effect] Disconnecting existing socket due to user change or logout.');
      socketRef.current.emit('leaveVenueRoom', 'global'); // Assuming a global room for user updates
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Establish new connection only if user is authenticated AND has a UID AND no socket exists yet
    if (user?.firebaseAuthUser?.uid && !socketRef.current) {
      console.log('[Socket.IO Effect] User is present with UID. Attempting to connect new socket for user:', user.firebaseAuthUser.uid);
      socketRef.current = io(BACKEND_BASE_URL, {
        transports: ['websocket'], // Force WebSocket transport
      });

      socketRef.current.on('connect', () => {
        console.log('[Socket.IO] Connected to backend server:', socketRef.current.id);
        if (user?.firebaseAuthUser?.uid) {
          console.log(`[Socket.IO] Emitting 'registerForUpdates' for user: ${user.firebaseAuthUser.uid}`);
          socketRef.current.emit('registerForUpdates', user.firebaseAuthUser.uid);
        } else {
          console.warn('[Socket.IO] User UID not available during connect event, cannot register for updates.');
        }
      });

      // --- MODIFIED: Direct token balance update ---
      socketRef.current.on('tokenBalanceUpdate', (data: { newBalance: number }) => {
        console.log(`[Socket.IO] Received tokenBalanceUpdate event: ${data.newBalance}. Directly updating user state.`);
        setUser(prevUser => {
          if (prevUser) {
            return { ...prevUser, tokenBalance: data.newBalance };
          }
          return null;
        });
      });
      // --- END MODIFIED ---

      socketRef.current.on('disconnect', (reason: string) => {
        console.log('[Socket.IO] Disconnected from backend server. Reason:', reason);
      });

      socketRef.current.on('connect_error', (error: any) => {
        console.error('[Socket.IO] Connection error:', error.message);
      });

      socketRef.current.on('error', (error: any) => {
        console.error('[Socket.IO] Generic socket error:', error);
      });

      // Return a cleanup function for this specific effect instance
      return () => {
        if (socketRef.current) {
          console.log('[Socket.IO Effect Cleanup] Disconnecting socket on unmount/dependency change.');
          socketRef.current.emit('leaveVenueRoom', 'global'); // Leave global room on cleanup
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    } else {
      console.log('[Socket.IO Effect] User is null or UID missing, or socket already exists. No new socket connection attempted.');
    }
    return undefined; // No specific cleanup needed if no connection was established
  }, [user?.firebaseAuthUser?.uid]); // Removed onAuthStateChanged from dependencies


  async function onGoogleButtonPress(): Promise<void> {
    try {
      console.log('[GoogleSignin] Checking Play Services...');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      console.log('[GoogleSignin] Starting sign-in...');
      const userInfo = await GoogleSignin.signIn();
      console.log('[GoogleSignin] userInfo:', userInfo);
      const idToken = userInfo?.data?.idToken;

      if (!idToken) {
        throw new Error('No ID token returned from Google Sign-In');
      }
      console.log('[GoogleSignin] Received idToken (first 20 chars):', idToken.substring(0, 20) + '...');

      const googleCredential = auth.GoogleAuthProvider.credential(idToken);

      console.log('[FirebaseAuth] Signing in with credential...');
      await auth().signInWithCredential(googleCredential);
      console.log('Signed in with Google to Firebase!');

    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('Google Sign-In cancelled');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Google Sign-In in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('Google Play Services not available or outdated');
      } else {
        console.error('[Google Sign-In Error]', {
          code: error.code,
          message: error.message,
          nativeErrorMessage: error.nativeErrorMessage,
          stack: error.stack,
        });
        Alert.alert('Google Sign-In Error', `Failed to sign in with Google: ${error.message}`);
      }
    }
  }

  async function signOut(): Promise<void> {
    try {
      await auth().signOut();
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      console.log('User signed out successfully!');
    } catch (error: any) {
      console.error('Sign out error:', error);
      Alert.alert('Sign Out Error', `Failed to sign out: ${error.message}`);
    }
  }

  if (initializing || isProfileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>
          {initializing ? 'Loading Firebase authentication...' : 'Fetching user profile...'}
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>Please sign in to continue to Billiards Hub.</Text>
        <GoogleSigninButton
          style={styles.googleButton}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={onGoogleButtonPress}
          disabled={false}
        />
      </SafeAreaView>
    );
  }

  return (
    <StripeProvider
      publishableKey="pk_test_51RauBOQXbI6EW0XUi1DeT8vKI3fS8Z7hGJyQs5jTjFlSdAWqbkQNOo54QMMYycw83lcrHMWnggZPvix5FNb0BeRk00Lu1rexTy" // REPLACE THIS WITH YOUR ACTUAL STRIPE PUBLISHABLE KEY
      // merchantIdentifier="merchant.com.your-app-name" // Optional: Required for Apple Pay
      // urlScheme="your-app-url-scheme" // Optional: Required for 3D Secure and other redirects
    >
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          {/* Authentication Screens (if you have them, uncomment and adjust paths) */}
          {/* <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} /> */}

          <Stack.Screen
            name="Home"
            // HomeScreen manages its own headerRight, but we need to ensure the header is shown.
            options={{ headerShown: true }} // Only ensure header is shown, HomeScreen sets its own headerRight
          >
            {(props) => (
              <HomeScreen
                {...props}
                user={user} // Pass the new User object
                signOut={signOut}
                pendingNotification={pendingNotification}
                clearPendingNotification={clearPendingNotification}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="VenueDetail"
            options={({ route }) => ({
              title: route.params.venueName || 'Venue Details',
              headerRight: () => user && <HeaderRight currentUser={user} />, // Pass currentUser prop
              headerShown: true // Ensure header is shown for VenueDetailScreen
            })}
          >
            {(props) => (
              <VenueDetailScreen
                {...props}
              />
            )}
          </Stack.Screen>
          {/* Admin Dashboard Screen */}
          <Stack.Screen
            name="AdminDashboard"
            options={{
              title: 'Admin Dashboard',
              headerRight: () => user && <HeaderRight currentUser={user} />, // Pass currentUser prop
              headerShown: true
            }}
          >
            {(props) => (
              <AdminDashboardScreen
                {...props}
                user={user} // Pass the user object to AdminDashboardScreen
                signOut={signOut}
              />
            )}
          </Stack.Screen>
          {/* Other screens (uncomment and adjust paths as needed) */}
          {/* <Stack.Screen name="UserProfile" component={UserProfileScreen} /> */}

          {/* NEW: TokenScreen */}
          <Stack.Screen
            name="TokenScreen"
            options={{
              title: 'Load Tokens',
              headerRight: () => user && <HeaderRight currentUser={user} />, // Pass currentUser prop
              headerShown: true
            }}
          >
            {(props) => (
              <TokenScreen
                {...props}
                // Pass the relevant parts of the new User object
                user={{ uid: user.firebaseAuthUser.uid, tokenBalance: user.tokenBalance ?? 0 }}
              />
            )}
          </Stack.Screen>

          {/* NEW: PayForTableScreen - Now passes currentUserTokenBalance */}
          <Stack.Screen
            name="PayForTable"
            options={{
              title: 'Pay for Table',
              headerRight: () => user && <HeaderRight currentUser={user} />, // Pass currentUser prop
              headerShown: true
            }}
          >
            {(props) => (
              <PayForTableScreen
                {...props}
                route={{
                  ...props.route,
                  params: {
                    ...props.route.params,
                    currentUserTokenBalance: user.tokenBalance ?? 0, // Pass current user's token balance
                  },
                }}
              />
            )}
          </Stack.Screen>

        </Stack.Navigator>
      </NavigationContainer>
    </StripeProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  tokenBalanceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007bff',
    marginBottom: 20,
  },
  googleButton: {
    width: 192,
    height: 48,
    marginTop: 20,
  },
  emailText: {
    fontSize: 18,
    marginBottom: 10,
    color: '#333',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginTop: 20,
    marginBottom: 20,
  },
  buttonContainer: {
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  locationInfoContainer: {
    marginTop: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#555',
  },
  errorText: {
    fontSize: 14,
    color: 'red',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 15,
    color: '#333',
  },
  venueList: {
    width: '100%',
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  venueItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  venueName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  venueAddress: {
    fontSize: 14,
    color: '#777',
    marginBottom: 5,
  },
  venueDetails: {
    fontSize: 14,
    color: '#555',
    marginTop: 5,
  },
  adminPanel: {
    marginTop: 30,
    padding: 10,
    backgroundColor: '#e6f7ff',
    borderRadius: 10,
    width: '95%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#91d5ff',
    marginBottom: 20,
  },
  adminPanelTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#0050b3',
    textDecorationLine: 'underline',
  },
  adminSection: {
    width: '100%',
    padding: 15,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  adminSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  input: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
  },
  halfInput: {
    width: '48%',
  },
  registerButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  picker: {
    width: '100%',
    marginBottom: 15,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  pickerLabel: {
    fontSize: 16,
    color: '#555',
    marginBottom: 5,
    alignSelf: 'flex-start',
    marginLeft: 5,
    fontWeight: '500',
  },
  pickerItem: {
    fontSize: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 15,
  },
});

export default App;
