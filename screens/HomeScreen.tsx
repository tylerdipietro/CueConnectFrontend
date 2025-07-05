import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import * as Location from 'expo-location';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList, Venue, User } from '../types'; // Import User type

// Import the HeaderRight component
import HeaderRight from '../components/HeaderRight';

// Define props for HomeScreen
type HomeScreenProps = StackScreenProps<RootStackParamList, 'Home'> & {
  user: User; // User object passed from App.tsx
  signOut: () => Promise<void>;
  pendingNotification: any | null;
  clearPendingNotification: () => void;
};

const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation, user, signOut, pendingNotification, clearPendingNotification }) => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState<boolean>(true);

  // Effect for handling pending notifications
  useEffect(() => {
    console.log('[NotificationHandler] HomeScreen useEffect triggered. pendingNotification:', pendingNotification ? 'exists' : 'null');
    if (pendingNotification) {
      const { notification, data } = pendingNotification;
      Alert.alert(
        notification?.title || 'New Notification',
        notification?.body || 'You have a new message.',
        [
          { text: 'OK', onPress: clearPendingNotification }
        ]
      );
    }
  }, [pendingNotification, clearPendingNotification]);

  // Effect for setting header options (including HeaderRight)
  useEffect(() => {
    // Only set headerRight if user is available
    if (user) {
      console.log('[HomeScreen:useEffect:setOptions] User object for HeaderRight:', JSON.stringify(user, (key, value) => {
        if (typeof value === 'function') return `[Function: ${key}]`;
        if (key === 'firebaseAuthUser' && value && typeof value === 'object') {
          return {
            uid: value.uid,
            email: value.email,
            displayName: value.displayName,
            getIdToken_exists: typeof value.getIdToken === 'function' ? 'function' : 'no'
          };
        }
        return value;
      }, 2));
      navigation.setOptions({
        headerRight: () => <HeaderRight currentUser={user} />,
        headerShown: true, // Ensure header is shown
      });
    } else {
      // Clear headerRight if user logs out
      navigation.setOptions({
        headerRight: undefined,
        headerShown: false, // Or keep true if you want a header without the button
      });
    }
  }, [navigation, user]); // Depend on navigation and user


  // Effect for location permissions and fetching current location
  useEffect(() => {
    (async () => {
      console.log('[Location] Requesting location permissions...');
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        setIsLoadingVenues(false);
        console.error('[Location] Permission denied:', errorMsg);
        return;
      }

      console.log('[Location] Fetching current location...');
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      console.log('[Location] Current location:', currentLocation);
    })();
  }, []); // Run once on component mount

  // Effect for fetching nearby venues
  const fetchNearbyVenues = useCallback(async () => {
    console.log(`[HomeScreen Effect] User and location ready. Attempting to fetch nearby venues.`);
    if (!user || !user.firebaseAuthUser?.uid || !location) {
      console.log(`[HomeScreen Effect] Skipping fetchNearbyVenues: user or location not ready.`, {
        userExists: !!user,
        firebaseAuthUserUidExists: !!user?.firebaseAuthUser?.uid,
        locationReady: !!location
      });
      setIsLoadingVenues(false);
      return;
    }

    setIsLoadingVenues(true);
    setErrorMsg(null);
    try {
      const idToken = await user.firebaseAuthUser.getIdToken(true);
      console.log('[FetchNearbyVenues Debug] User object before getIdToken:', user);
      console.log('[FetchNearbyVenues Debug] Type of user:', typeof user);
      console.log('[FetchNearbyVenues Debug] Does user.firebaseAuthUser have getIdToken?', typeof user.firebaseAuthUser?.getIdToken === 'function' ? 'function' : 'no');


      const lat = location.coords.latitude;
      const lon = location.coords.longitude;
      const radiusMiles = 5; // Example radius

      console.log(`[API] Fetching nearby venues: token retrieved. Length: ${idToken.length} Starts with: ${idToken.substring(0, 10)}`);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/nearby?lat=${lat}&lon=${lon}&radiusMiles=${radiusMiles}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch nearby venues');
      }

      const data: Venue[] = await response.json();
      console.log('[API] Nearby venues fetched:', data);
      setVenues(data);
    } catch (err: any) {
      console.error('Error fetching nearby venues:', err);
      setErrorMsg(`Failed to load venues: ${err.message}`);
    } finally {
      setIsLoadingVenues(false);
    }
  }, [user, location]); // Depend on user and location

  useEffect(() => {
    fetchNearbyVenues();
  }, [fetchNearbyVenues]);

  const renderVenueItem = ({ item }: { item: Venue }) => (
    <TouchableOpacity
      style={styles.venueItem}
      onPress={() => navigation.navigate('VenueDetail', { venueId: item._id, venueName: item.name })}
    >
      <Text style={styles.venueName}>{item.name}</Text>
      <Text style={styles.venueAddress}>{item.address}</Text>
      {item.perGameCost !== undefined && (
        <Text style={styles.venueDetails}>Per Game Cost: {item.perGameCost} tokens</Text>
      )}
      <Text style={styles.venueDetails}>Tables: {item.numberOfTables}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Billiards Hub</Text>

        {/* Welcome Username */}
        <Text style={styles.welcomeText}>
          Welcome {user?.firebaseAuthUser?.displayName || 'User'}!
        </Text>

        {user.isAdmin && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() => navigation.navigate('AdminDashboard')}
          >
            <Text style={styles.adminButtonText}>Admin Dashboard</Text>
          </TouchableOpacity>
        )}

        {/* Removed "Load Tokens" button and "Your Tokens" display */}
        {/* <TouchableOpacity
          style={styles.tokenButton}
          onPress={() => navigation.navigate('TokenScreen', { user: { uid: user.firebaseAuthUser.uid, tokenBalance: user.tokenBalance ?? 0 } })}
        >
          <Text style={styles.tokenButtonText}>Load Tokens</Text>
        </TouchableOpacity>

        <Text style={styles.tokenBalanceText}>Your Tokens: {user.tokenBalance ?? 0}</Text> */}


        <Text style={styles.sectionTitle}>Nearby Venues</Text>
        {isLoadingVenues ? (
          <ActivityIndicator size="large" color="#0000ff" />
        ) : errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : venues.length > 0 ? (
          <FlatList
            data={venues}
            renderItem={renderVenueItem}
            keyExtractor={item => item._id}
            contentContainerStyle={styles.venueList}
          />
        ) : (
          <Text style={styles.infoText}>No venues found near your location.</Text>
        )}

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  welcomeText: { // New style for welcome message
    fontSize: 20,
    fontWeight: '600',
    color: '#555',
    marginBottom: 20,
    textAlign: 'center',
  },
  adminButton: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  adminButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenButton: { // Keep this style in case you want to re-add it later
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  tokenButtonText: { // Keep this style in case you want to re-add it later
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenBalanceText: { // Keep this style in case you want to re-add it later
    fontSize: 18,
    fontWeight: '600',
    color: '#007bff',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 15,
    color: '#333',
    alignSelf: 'flex-start',
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  venueList: {
    width: '100%',
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
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
  infoText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  signOutButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
