import React, { useState, useEffect, useCallback } from 'react';
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
import { GoogleSignin, GoogleSigninButton, statusCodes } from '@react-native-google-signin/google-signin';
import * as Location from 'expo-location';

// Import navigation components
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';

// Import the new VenueDetailScreen component
import VenueDetailScreen from './VenueDetailScreen'; // Assuming VenueDetailScreen.tsx in same directory

// Define the type for your navigation stack parameters
type RootStackParamList = {
  Home: { user: User; signOut: () => Promise<void> }; // Home screen with user and signOut props
  VenueDetail: { venueId: string; venueName: string }; // VenueDetail screen with venue ID and name
};

// Create the stack navigator
const Stack = createStackNavigator<RootStackParamList>();

// Extend the User type to include admin status and token balance
type User = (FirebaseAuthTypes.User & { isAdmin?: boolean; tokenBalance?: number }) | null;

interface Venue {
  _id: string;
  name: string;
  address: string;
  numberOfTables?: number;
}

// Backend base URL
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

// Define the props for HomeScreen, including navigation props
type HomeScreenProps = StackScreenProps<RootStackParamList, 'Home'>;

// --- HomeScreen Component (now receives navigation prop) ---
const HomeScreen = ({ route, navigation }: HomeScreenProps): JSX.Element => {
  const { user, signOut } = route.params; // Get user and signOut from route params
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [nearbyVenues, setNearbyVenues] = useState<Venue[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State for new venue registration form
  const [newVenueName, setNewVenueName] = useState<string>('');
  const [newVenueAddress, setNewVenueAddress] = useState<string>('');
  const [newVenueLat, setNewVenueLat] = useState<string>('');
  const [newVenueLon, setNewVenueLon] = useState<string>('');
  const [newVenueTablesCount, setNewVenueTablesCount] = useState<string>('');
  const [isRegisteringVenue, setIsRegisteringVenue] = useState<boolean>(false);

  // State for new table registration form
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [newTableNumber, setNewTableNumber] = useState<string>('');
  const [newEsp32DeviceId, setNewEsp32DeviceId] = useState<string>('');
  const [isRegisteringTable, setIsRegisteringTable] = useState<boolean>(false);
  const [isLoadingVenuesForAdmin, setIsLoadingVenuesForAdmin] = useState<boolean>(false);

  // Function to fetch user's current location
  const requestLocationPermissionAndGetLocation = useCallback(async () => {
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
      setNewVenueLat(currentLocation.coords.latitude.toFixed(6));
      setNewVenueLon(currentLocation.coords.longitude.toFixed(6));
    } catch (error) {
      console.error('[Location Error]', error);
      setErrorMsg('Failed to get location. Please ensure location services are enabled.');
    } finally {
      setIsLoadingLocations(false);
    }
  }, []);

  // Function to fetch nearby venues from the backend
  const fetchNearbyVenues = useCallback(async () => {
    if (!location || !user) {
      return;
    }

    setIsLoadingLocations(true);
    setErrorMsg(null);
    try {
      const idToken = await user.getIdToken(true);
      console.log('[API] Fetching nearby venues: token retrieved. Length:', idToken.length, 'Starts with:', idToken.substring(0, 10));

      const { latitude, longitude } = location.coords;
      const radiusMiles = 5;

      const backendUrl = `${BACKEND_BASE_URL}/api/venues/nearby?lat=${latitude}&lon=${longitude}&radiusMiles=${radiusMiles}`;

      console.log('[API] Fetching nearby venues from:', backendUrl);
      const response = await fetch(backendUrl, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = `HTTP error! status: ${response.status}. Message: ${errorData}`;
        try {
            const jsonError = JSON.parse(errorData);
            errorMessage = jsonError.message || errorMessage;
        } catch (e) {
            // Not JSON, use raw text
        }
        throw new Error(errorMessage);
      }

      const data: Venue[] = await response.json();
      setNearbyVenues(data);
      console.log('[API] Nearby venues fetched:', data);
    } catch (error: any) {
      console.error('[Fetch Venues Error]', error);
      Alert.alert('Error', `Failed to fetch nearby pool bars: ${error.message || 'Network error'}. Please ensure your backend is running and accessible.`);
      setNearbyVenues([]);
    } finally {
      setIsLoadingLocations(false);
    }
  }, [location, user]);

  // Initial location fetch
  useEffect(() => {
    requestLocationPermissionAndGetLocation();
  }, [requestLocationPermissionAndGetLocation]);

  // Fetch nearby venues when location AND user are available
  useEffect(() => {
    if (user && location) {
      fetchNearbyVenues();
    }
  }, [fetchNearbyVenues, user, location]);

  // Function to fetch ALL venues for admin panel (for dropdown)
  const fetchAllVenuesForAdmin = useCallback(async () => {
    if (!user?.isAdmin) {
      return;
    }

    setIsLoadingVenuesForAdmin(true);
    try {
      const idToken = await user.getIdToken(true);
      console.log('[API] Fetching all venues for admin: token retrieved. Length:', idToken.length, 'Starts with:', idToken.substring(0, 10));

      const response = await fetch(`${BACKEND_BASE_URL}/api/venues`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = `HTTP error! status: ${response.status}. Message: ${errorData}`;
        try {
            const jsonError = JSON.parse(errorData);
            errorMessage = jsonError.message || errorMessage;
        } catch (e) {
            // If it's not JSON, the raw text will be used
        }
        throw new Error(errorMessage);
      }

      const data: Venue[] = await response.json();
      setAllVenues(data);
      if (data.length > 0 && !selectedVenueId) {
        setSelectedVenueId(data[0]._id);
      }
      console.log('[API] All venues fetched for admin:', data);
    } catch (error: any) {
      console.error('[Fetch All Venues Error]', error);
      Alert.alert('Error', `Failed to load venues for admin: ${error.message}`);
      setAllVenues([]);
    } finally {
      setIsLoadingVenuesForAdmin(false);
    }
  }, [user, selectedVenueId]);

  // Fetch all venues when admin panel is shown and user is ready
  useEffect(() => {
    if (user?.isAdmin) {
      fetchAllVenuesForAdmin();
    }
  }, [user?.isAdmin, fetchAllVenuesForAdmin]);


  // Handle new venue registration
  const handleRegisterVenue = async () => {
    if (!user) {
      Alert.alert('Authentication Error', 'User not authenticated.');
      return;
    }
    if (!newVenueName || !newVenueAddress || !newVenueLat || !newVenueLon || !newVenueTablesCount || isNaN(parseInt(newVenueTablesCount, 10))) {
      Alert.alert('Missing Information', 'Please fill in all venue details and a valid number of tables.');
      return;
    }

    setIsRegisteringVenue(true);
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: newVenueName,
          address: newVenueAddress,
          latitude: parseFloat(newVenueLat),
          longitude: parseFloat(newVenueLon),
          numberOfTables: parseInt(newVenueTablesCount, 10),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to register venue.');
      }

      const registeredVenue = await response.json();
      Alert.alert('Success', `Venue "${registeredVenue.name}" registered successfully!`);
      console.log('Registered Venue:', registeredVenue);

      setNewVenueName('');
      setNewVenueAddress('');
      setNewVenueTablesCount('');
      fetchAllVenuesForAdmin();
      fetchNearbyVenues();
    } catch (error: any) {
      console.error('Venue registration error:', error);
      Alert.alert('Registration Failed', `Error: ${error.message}`);
    } finally {
      setIsRegisteringVenue(false);
    }
  };

  // Handle new table registration
  const handleRegisterTable = async () => {
    if (!user) {
      Alert.alert('Authentication Error', 'User not authenticated.');
      return;
    }
    if (!selectedVenueId || !newTableNumber || !newEsp32DeviceId) {
      Alert.alert('Missing Information', 'Please select a venue and fill in table number and ESP32 Device ID.');
      return;
    }

    setIsRegisteringTable(true);
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          venueId: selectedVenueId,
          tableNumber: newTableNumber,
          esp32DeviceId: newEsp32DeviceId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to register table.');
      }

      const registeredTable = await response.json();
      Alert.alert('Success', `Table "${registeredTable.tableNumber}" registered at ${allVenues.find(v => v._id === registeredTable.venueId)?.name || 'selected venue'}!`);
      console.log('Registered Table:', registeredTable);

      setNewTableNumber('');
      setNewEsp32DeviceId('');

    } catch (error: any) {
      console.error('Table registration error:', error);
      Alert.alert('Registration Failed', `Error: ${error.message}`);
    } finally {
      setIsRegisteringTable(false);
    }
  };


  const renderVenueItem = ({ item }: { item: Venue }) => (
    <View style={styles.venueItem}>
      <Text style={styles.venueName}>{item.name}</Text>
      <Text style={styles.venueAddress}>{item.address}</Text>
      {item.numberOfTables !== undefined && (
         <Text style={styles.venueDetails}>Tables: {item.numberOfTables}</Text>
      )}
      {/* Changed button text and action for navigation */}
      <Button
        title="View Locations"
        onPress={() => navigation.navigate('VenueDetail', { venueId: item._id, venueName: item.name })}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.title}>Welcome to Billiards Hub, {user?.displayName || user?.email}!</Text>
        <Text style={styles.subtitle}>Find a pool table near you:</Text>
        <Text style={styles.tokenBalanceText}>Tokens: {user?.tokenBalance ?? 'Loading...'}</Text>


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
              scrollEnabled={false}
            />
          </>
        ) : (
          <Text style={styles.noVenuesText}>No pool bars found nearby. Try again later or adjust location.</Text>
        )}

        {/* Admin Panel */}
        {user?.isAdmin && (
          <View style={styles.adminPanel}>
            <Text style={styles.adminPanelTitle}>Admin Panel</Text>

            {/* Register New Venue Section */}
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionTitle}>Register New Venue</Text>
              <TextInput
                style={styles.input}
                placeholder="Venue Name"
                value={newVenueName}
                onChangeText={setNewVenueName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Address"
                value={newVenueAddress}
                onChangeText={setNewVenueAddress}
                autoCapitalize="words"
              />
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Latitude"
                  value={newVenueLat}
                  onChangeText={setNewVenueLat}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Longitude"
                  value={newVenueLon}
                  onChangeText={setNewVenueLon}
                  keyboardType="numeric"
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Initial Number of Tables (e.g., 5)"
                value={newVenueTablesCount}
                onChangeText={setNewVenueTablesCount}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={styles.registerButton}
                onPress={handleRegisterVenue}
                disabled={isRegisteringVenue}
              >
                {isRegisteringVenue ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.registerButtonText}>Register Venue</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Register Specific Table Section */}
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionTitle}>Register Specific Table</Text>
              {isLoadingVenuesForAdmin ? (
                <ActivityIndicator size="small" color="#0000ff" />
              ) : allVenues.length > 0 ? (
                <Picker
                  selectedValue={selectedVenueId}
                  onValueChange={(itemValue, itemIndex) =>
                    setSelectedVenueId(itemValue)
                  }
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  {allVenues.map((venue) => (
                    <Picker.Item key={venue._id} label={venue.name} value={venue._id} />
                  ))}
                </Picker>
              ) : (
                <Text style={styles.infoText}>No venues available. Register a venue first.</Text>
              )}

              <TextInput
                style={styles.input}
                placeholder="Table Number (e.g., A1, 2, Pool Table 3)"
                value={newTableNumber}
                onChangeText={setNewTableNumber}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="ESP32 Device ID (Unique Identifier)"
                value={newEsp32DeviceId}
                onChangeText={setNewEsp32DeviceId}
              />
              <TouchableOpacity
                style={styles.registerButton}
                onPress={handleRegisterTable}
                disabled={isRegisteringTable || !selectedVenueId}
              >
                {isRegisteringTable ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.registerButtonText}>Register Table</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        )}

        <View style={styles.buttonContainer}>
          <Button title="Sign Out" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
// --- End HomeScreen Component ---

// --- Main App Component (now handles navigation) ---
const App = (): JSX.Element => {
  const [initializing, setInitializing] = useState<boolean>(true);
  const [user, setUser] = useState<User>(null);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '47513412219-hsvcpm1h7f3kusd42sk31i89ilv7lk94.apps.googleusercontent.com',
      iosClientId: '47513412219-s7h2uea77hgadicf5kti86rl6aifobg9.apps.googleusercontent.com',
      scopes: ['email', 'profile'],
    });
    console.log('[GoogleSignin] Configured');
  }, []);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return subscriber;
  }, []);

  /**
   * Fetches user profile (including isAdmin status and tokenBalance) from backend after Firebase auth.
   */
  const fetchUserProfile = async (firebaseUser: FirebaseAuthTypes.User) => {
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
  };

  async function onAuthStateChanged(firebaseUser: FirebaseAuthTypes.User | null) {
    console.log('[AuthStateChanged] User:', firebaseUser ? 'present' : 'null');
    if (firebaseUser) {
      const profile = await fetchUserProfile(firebaseUser);
      // Directly assign properties to the firebaseUser object to preserve its methods
      (firebaseUser as User).isAdmin = profile.isAdmin;
      (firebaseUser as User).tokenBalance = profile.tokenBalance;
      setUser(firebaseUser as User);
    } else {
      setUser(null);
    }
    if (initializing) setInitializing(false);
  }

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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>{initializing ? 'Loading Firebase authentication...' : 'Fetching user profile...'}</Text>
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
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" options={{ headerShown: false }}>
          {/* Pass user and signOut as initial parameters */}
          {(props) => <HomeScreen {...props} route={{ ...props.route, params: { user, signOut } }} />}
        </Stack.Screen>
        <Stack.Screen
          name="VenueDetail"
          component={VenueDetailScreen}
          options={({ route }) => ({ title: route.params.venueName || 'Venue Details' })}
        />
      </Stack.Navigator>
    </NavigationContainer>
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
    shadowRadius: 2,
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
