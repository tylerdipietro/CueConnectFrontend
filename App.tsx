import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
  Image,
  SafeAreaView,
  FlatList, // Added FlatList for displaying venues
  Platform, // Added Platform to check OS for permissions
} from 'react-native';

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin, GoogleSigninButton, statusCodes } from '@react-native-google-signin/google-signin';
import * as Location from 'expo-location'; // Import expo-location

type User = FirebaseAuthTypes.User | null;

// Define a type for your venue data based on your backend schema
interface Venue {
  _id: string;
  name: string;
  address: string;
  // IMPORTANT: Ensure your Venue model in the backend has a 'location' field
  // structured as a GeoJSON Point for $geoNear to work, e.g.:
  // location: { type: 'Point', coordinates: [longitude, latitude] }
  // You might also need to create a 2dsphere index on this field in MongoDB.
}

// --- New HomeScreen Component ---
const HomeScreen = ({ user, signOut }: { user: User; signOut: () => Promise<void> }): JSX.Element => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [nearbyVenues, setNearbyVenues] = useState<Venue[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Function to request location permissions and get current location
    const requestLocationPermissionAndGetLocation = async () => {
      setIsLoadingLocations(true);
      setErrorMsg(null);
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied. Please enable location services for this app.');
          setIsLoadingLocations(false);
          return;
        }

        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        console.log('[Location] Current location:', currentLocation.coords);
      } catch (error) {
        console.error('[Location Error]', error);
        setErrorMsg('Failed to get location. Please ensure location services are enabled.');
      } finally {
        setIsLoadingLocations(false);
      }
    };

    requestLocationPermissionAndGetLocation();
  }, []); // Run once on component mount

  useEffect(() => {
    // Function to fetch nearby venues from the backend
    const fetchNearbyVenues = async () => {
      if (!location) {
        // Only fetch if location is available
        return;
      }

      setIsLoadingLocations(true);
      setErrorMsg(null);
      try {
        const { latitude, longitude } = location.coords;
        const radiusMiles = 5; // 5-mile radius

        // CORRECTED: The backend URL now correctly points to /api/venues/nearby
        // based on your venueRoutes.js which has router.get('/nearby', ...)
        // and assuming it's mounted under '/api/venues' in your main app.js/index.js.
        const backendBaseUrl = 'https://api.tylerdipietro.com'; // Replace with your actual backend URL when deployed
        const backendUrl = `${backendBaseUrl}/api/venues/nearby?lat=${latitude}&lon=${longitude}&radius=${radiusMiles}`;

        console.log('[API] Fetching nearby venues from:', backendUrl);
        const response = await fetch(backendUrl);

        if (!response.ok) {
          // Attempt to read error message from backend
          const errorData = await response.text();
          throw new Error(`HTTP error! status: ${response.status}. Message: ${errorData}`);
        }

        const data: Venue[] = await response.json();
        setNearbyVenues(data);
        console.log('[API] Nearby venues fetched:', data);
      } catch (error: any) {
        console.error('[Fetch Venues Error]', error);
        setErrorMsg(`Failed to fetch nearby pool bars: ${error.message || 'Network error'}. Please ensure your backend is running and accessible from your device.`);
        setNearbyVenues([]); // Clear venues on error
      } finally {
        setIsLoadingLocations(false);
      }
    };

    fetchNearbyVenues();
  }, [location]); // Re-fetch when location changes

  const renderVenueItem = ({ item }: { item: Venue }) => (
    <View style={styles.venueItem}>
      <Text style={styles.venueName}>{item.name}</Text>
      <Text style={styles.venueAddress}>{item.address}</Text>
      {/* Add more venue details here if available, e.g., table status, waitlist length */}
      <Button title="View Queue/Pay" onPress={() => console.log('View details for:', item.name)} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Welcome to Billiards Hub, {user?.displayName || user?.email}!</Text>
      <Text style={styles.subtitle}>Find a pool table near you:</Text>

      <View style={styles.locationInfoContainer}>
        {isLoadingLocations ? (
          <ActivityIndicator size="small" color="#0000ff" />
        ) : errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : location ? (
          <Text style={styles.locationText}>
            Your location: Lat {location.coords.latitude.toFixed(4)}, Lon {location.coords.longitude.toFixed(4)}
          </Text>
        ) : (
          <Text style={styles.locationText}>Location not available.</Text>
        )}
      </View>

      {isLoadingLocations && nearbyVenues.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Searching for nearby pool bars...</Text>
        </View>
      ) : nearbyVenues.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Pool Bars within 5 miles:</Text>
          <FlatList
            data={nearbyVenues}
            renderItem={renderVenueItem}
            keyExtractor={item => item._id}
            contentContainerStyle={styles.venueList}
          />
        </>
      ) : (
        <Text style={styles.noVenuesText}>No pool bars found nearby. Try again later or adjust location.</Text>
      )}

      <View style={styles.buttonContainer}>
        <Button title="Sign Out" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
};
// --- End HomeScreen Component ---

const App = (): JSX.Element => {
  const [initializing, setInitializing] = useState<boolean>(true);
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    // Configure Google Sign-In with your web and iOS client IDs
    GoogleSignin.configure({
      webClientId: '47513412219-hsvcpm1h7f3kusd42sk31i89ilv7lk94.apps.googleusercontent.com',
      iosClientId: '47513412219-s7h2uea77hgadicf5kti86rl6aifobg9.apps.googleusercontent.com',
      scopes: ['email', 'profile'],
    });
    console.log('[GoogleSignin] Configured');
  }, []);

  useEffect(() => {
    // Subscribe to Firebase Auth state changes
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return subscriber; // Unsubscribe on component unmount
  }, []);

  /**
   * Callback function for Firebase authentication state changes.
   * Updates the user state and sets initializing to false once the initial check is done.
   */
  function onAuthStateChanged(firebaseUser: FirebaseAuthTypes.User | null) {
    console.log('[AuthStateChanged] User:', firebaseUser);
    setUser(firebaseUser);
    if (initializing) setInitializing(false);
  }

  /**
   * Handles the Google Sign-In button press.
   * Checks for Play Services, initiates Google Sign-In, and then signs in to Firebase with the Google credential.
   */
  async function onGoogleButtonPress(): Promise<void> {
    try {
      console.log('[GoogleSignin] Checking Play Services...');
      // Ensure Google Play Services are available on Android
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      console.log('[GoogleSignin] Starting sign-in...');
      // Initiate Google Sign-In flow
      const userInfo = await GoogleSignin.signIn();
      console.log('[GoogleSignin] userInfo:', userInfo);

      // Extract the ID token from the Google user info
      const idToken = userInfo?.idToken; // Use userInfo.idToken directly

      if (!idToken) {
        throw new Error('No ID token returned from Google Sign-In');
      }
      console.log('[GoogleSignin] Received idToken:', idToken);

      // Build a Firebase credential with the Google ID token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);

      console.log('[FirebaseAuth] Signing in with credential...');
      // Sign in to Firebase with the constructed credential
      await auth().signInWithCredential(googleCredential);
      console.log('Signed in with Google to Firebase!');

    } catch (error: any) {
      // Handle various Google Sign-In errors
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('Google Sign-In cancelled by user');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Google Sign-In is already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('Google Play Services not available or outdated on this device');
      } else {
        console.error('[Google Sign-In Error]', {
          code: error.code,
          message: error.message,
          nativeErrorMessage: error.nativeErrorMessage,
          stack: error.stack,
        });
      }
    }
  }

  /**
   * Handles user sign out from both Firebase and Google.
   */
  async function signOut(): Promise<void> {
    try {
      // Sign out from Firebase
      await auth().signOut();
      // Revoke access and sign out from Google Sign-In
      await GoogleSignin.revokeAccess(); // Important for removing app permissions
      await GoogleSignin.signOut();
      console.log('User signed out successfully!');
    } catch (error: any) {
      console.error('Sign out error:', error);
    }
  }

  // Display a loading indicator while Firebase authentication is initializing
  if (initializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading Firebase authentication...</Text>
      </View>
    );
  }

  // If no user is authenticated, show the Google Sign-In button
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
          disabled={false} // Enable/disable based on network status if needed
        />
      </SafeAreaView>
    );
  }

  // If a user is authenticated, render the HomeScreen
  return <HomeScreen user={user} signOut={signOut} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
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
  featureSection: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    width: '90%',
    alignItems: 'flex-start',
  },
  featureText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  featureItem: {
    fontSize: 16,
    color: '#555',
    marginBottom: 5,
  },
  // New styles for location and venue list
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
    paddingBottom: 20, // Add padding to the bottom of the list
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
    marginBottom: 10,
  },
});

export default App;
