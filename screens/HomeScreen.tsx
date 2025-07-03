import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Location from 'expo-location';
import { StackScreenProps } from '@react-navigation/stack';

// Import the RootStackParamList and User types from App.tsx
import { RootStackParamList, User } from '../App';

// Import the new HeaderRight component
import HeaderRight from '../components/HeaderRight';

interface Venue {
  _id: string;
  name: string;
  address: string;
  numberOfTables?: number;
}

interface Table {
  _id: string;
  venueId: string;
  tableNumber: string | number;
  esp32DeviceId?: string;
  status: 'available' | 'occupied' | 'queued' | 'maintenance';
  currentSessionId?: string;
  queue: string[];
}

// Backend base URL
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

// Define the props for HomeScreen
type HomeScreenProps = StackScreenProps<RootStackParamList, 'Home'> & {
  user: User;
  signOut: () => Promise<void>;
  pendingNotification: any | null;
  clearPendingNotification: () => void;
};

// --- HomeScreen Component ---
const HomeScreen = ({ navigation, user, signOut, pendingNotification, clearPendingNotification }: HomeScreenProps): JSX.Element => {

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [nearbyVenues, setNearbyVenues] = useState<Venue[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState<boolean>(true);
  const [errorMsg, useStateErrorMsg] = useState<string | null>(null);

  // State for new venue registration form
  const [newVenueName, setNewVenueName] = useState<string>('');
  const [newVenueAddress, setNewVenueAddress] = useState<string>('');
  const [newVenueLat, setNewVenueLat] = useState<string>('');
  const [newVenueLon, setNewVenueLon] = useState<string>('');
  const [newVenueTablesCount, setNewVenueTablesCount] = useState<string>('');
  const [isRegisteringVenue, setIsRegisteringVenue] = useState<boolean>(false);

  // State for editing specific table
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [tablesForSelectedVenue, setTablesForSelectedVenue] = useState<Table[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editTableNumber, setEditTableNumber] = useState<string>('');
  const [editEsp32DeviceId, setEditEsp32DeviceId] = useState<string>('');
  const [isEditingTable, setIsEditingTable] = useState<boolean>(false);
  const [isLoadingVenuesForAdmin, setIsLoadingVenuesForAdmin] = useState<boolean>(false);
  const [isLoadingTablesForEdit, setIsLoadingTablesForEdit] = useState<boolean>(false);

  // Set header options dynamically
  useEffect(() => {
    navigation.setOptions({
      headerShown: true, // Ensure header is shown for HomeScreen
      title: 'Billiards Hub', // Title for the header
      headerRight: () => (
        // Pass the full 'user' object to HeaderRight
        <HeaderRight currentUser={user} />
      ),
      headerStyle: {
        backgroundColor: '#f5f5f5',
      },
      headerTintColor: '#333',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    });
  }, [navigation, user]); // Depend on the entire user object to update header if tokenBalance changes


  // Function to handle confirming a win
  const handleConfirmWin = useCallback(async (data: any) => {
    if (!user || !user.uid) {
      Alert.alert('Authentication Error', 'You must be logged in to confirm a win.');
      return;
    }
    console.log('[WinConfirmation] Confirming win with data:', data);
    console.log('[WinConfirmation Debug] User object before getIdToken (ConfirmWin):', user);
    console.log('[WinConfirmation Debug] Type of user (ConfirmWin):', typeof user);
    console.log('[WinConfirmation Debug] Does user have getIdToken (ConfirmWin)?', typeof (user as any).getIdToken); // Cast to any for checking method
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${data.tableId}/confirm-win`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sessionId: data.sessionId,
          winnerId: data.winnerId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to confirm win.');
      }
      Alert.alert('Success', 'Win confirmed!');
    } catch (error: any) {
      console.error('Error confirming win:', error);
      Alert.alert('Error', `Failed to confirm win: ${error.message}`);
    } finally {
      clearPendingNotification();
    }
  }, [user, clearPendingNotification]);

  // Function to handle disputing a win
  const handleDisputeWin = useCallback(async (data: any) => {
    if (!user || !user.uid) {
      Alert.alert('Authentication Error', 'You must be logged in to dispute a win.');
      return;
    }
    console.log('[WinConfirmation] Disputing win with data:', data);
    console.log('[WinConfirmation Debug] User object before getIdToken (DisputeWin):', user);
    console.log('[WinConfirmation Debug] Type of user (DisputeWin):', typeof user);
    console.log('[WinConfirmation Debug] Does user have getIdToken (DisputeWin)?', typeof (user as any).getIdToken); // Cast to any for checking method
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${data.tableId}/dispute-win`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sessionId: data.sessionId,
          disputerId: user.uid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to dispute win.');
      }
      Alert.alert('Success', 'Win dispute submitted.');
    } catch (error: any) {
      console.error('Error disputing win:', error);
      Alert.alert('Error', `Failed to dispute win: ${error.message}`);
    } finally {
      clearPendingNotification();
    }
  }, [user, clearPendingNotification]);

  useEffect(() => {
    console.log('[NotificationHandler] HomeScreen useEffect triggered. pendingNotification:', JSON.stringify(pendingNotification, null, 2));

    if (pendingNotification) {
      console.log('[NotificationHandler] Raw pendingNotification object:', pendingNotification);

      if (pendingNotification.data?.type === 'win_confirmation') {
        const { winnerName, venueName, tableNumber } = pendingNotification.data;
        console.log('[NotificationHandler] Triggering win confirmation alert for:', {
          winnerName,
          venueName,
          tableNumber,
        });

        Alert.alert(
          'Win Claimed!',
          `${winnerName} claims victory on Table ${tableNumber}, confirm or dispute?`,
          [
            {
              text: 'Dispute',
              onPress: () => handleDisputeWin(pendingNotification.data),
              style: 'destructive',
            },
            {
              text: 'Confirm',
              onPress: () => handleConfirmWin(pendingNotification.data),
              style: 'default',
            },
          ],
          { cancelable: false }
        );
      } else {
        console.log('[NotificationHandler] Handling generic notification:', pendingNotification.notification);

        Alert.alert(
          pendingNotification.notification?.title || 'New Notification',
          pendingNotification.notification?.body || 'You have a new message.'
          // Removed OK button to allow default dismiss behavior
        );
      }
    }
  }, [pendingNotification, clearPendingNotification, handleConfirmWin, handleDisputeWin]);


  const requestLocationPermissionAndGetLocation = useCallback(async () => {
    setIsLoadingLocations(true);
    useStateErrorMsg(null);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        useStateErrorMsg('Permission to access location was denied. Please enable location services for this app.');
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
      useStateErrorMsg('Failed to get location. Please ensure location services are enabled.');
    } finally {
      setIsLoadingLocations(false);
    }
  }, []);

  const fetchNearbyVenues = useCallback(async () => {
    if (!location || !user || !user.uid) { // Ensure user and uid are present
      console.log('[FetchNearbyVenues Debug] Skipping fetch: location or user not ready.', { location: !!location, user: !!user, userId: user?.uid });
      return;
    }

    setIsLoadingLocations(true);
    useStateErrorMsg(null);
    try {
      console.log('[FetchNearbyVenues Debug] User object before getIdToken:', user);
      console.log('[FetchNearbyVenues Debug] Type of user:', typeof user);
      console.log('[FetchNearbyVenues Debug] Does user have getIdToken?', typeof (user as any).getIdToken); // Cast to any for checking method
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
  }, [location, user]); // Depend on user to re-run when user object changes


  useEffect(() => {
    requestLocationPermissionAndGetLocation();
  }, [requestLocationPermissionAndGetLocation]);

  useEffect(() => {
    // Only fetch nearby venues if location and user are available and ready
    if (user && user.uid && location) {
      fetchNearbyVenues();
    } else {
      console.log('[HomeScreen Effect] Skipping fetchNearbyVenues: user or location not ready.', { userReady: !!user?.uid, locationReady: !!location });
    }
  }, [fetchNearbyVenues, user, location]); // Depend on fetchNearbyVenues, user, and location


  const fetchAllVenuesForAdmin = useCallback(async () => {
    if (!user?.isAdmin || !user?.uid) { // Ensure user is admin and uid is present
      console.log('[FetchAllVenuesForAdmin Debug] Skipping fetch: user is not admin or user not ready.', { isAdmin: user?.isAdmin, userId: user?.uid });
      return;
    }

    setIsLoadingVenuesForAdmin(true);
    try {
      console.log('[FetchAllVenuesForAdmin Debug] User object before getIdToken:', user);
      console.log('[FetchAllVenuesForAdmin Debug] Type of user:', typeof user);
      console.log('[FetchAllVenuesForAdmin Debug] Does user have getIdToken?', typeof (user as any).getIdToken); // Cast to any for checking method
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
  }, [user, selectedVenueId]); // Depend on user to re-run when user object changes

  useEffect(() => {
    // Only fetch all venues for admin if user is admin and ready
    if (user?.isAdmin && user?.uid) {
      fetchAllVenuesForAdmin();
    } else {
      console.log('[HomeScreen Effect] Skipping fetchAllVenuesForAdmin: user not admin or not ready.', { isAdmin: user?.isAdmin, userReady: !!user?.uid });
    }
  }, [user?.isAdmin, user?.uid, fetchAllVenuesForAdmin]); // Depend on user.isAdmin and user.uid


  const fetchTablesForSelectedVenue = useCallback(async () => {
    if (!selectedVenueId || !user || !user.uid) { // Ensure user and uid are present
      setTablesForSelectedVenue([]);
      setSelectedTableId(null);
      setEditTableNumber('');
      setEditEsp32DeviceId('');
      console.log('[FetchTablesForSelectedVenue Debug] Skipping fetch: selectedVenueId or user not ready.');
      return;
    }

    setIsLoadingTablesForEdit(true);
    try {
      console.log('[FetchTablesForSelectedVenue Debug] User object before getIdToken:', user);
      console.log('[FetchTablesForSelectedVenue Debug] Type of user:', typeof user);
      console.log('[FetchTablesForSelectedVenue Debug] Does user have getIdToken?', typeof (user as any).getIdToken); // Cast to any for checking method
      const idToken = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${selectedVenueId}/tables`, {
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
      const data: Table[] = await response.json();
      setTablesForSelectedVenue(data);
      console.log(`[API] Tables fetched for venue ${selectedVenueId}:`, data);

      if (data.length > 0 && !selectedTableId) {
        setSelectedTableId(data[0]._id);
      } else if (data.length === 0) {
        setSelectedTableId(null);
      }
    } catch (error: any) {
      console.error('Error fetching tables for selected venue:', error);
      Alert.alert('Error', `Failed to load tables for editing: ${error.message}`);
      setTablesForSelectedVenue([]);
      setSelectedTableId(null);
    } finally {
      setIsLoadingTablesForEdit(false);
    }
  }, [selectedVenueId, user, selectedTableId]); // Depend on user to re-run when user object changes

  useEffect(() => {
    // Only fetch tables if selectedVenueId and user are available and ready
    if (selectedVenueId && user && user.uid) {
      fetchTablesForSelectedVenue();
    } else {
      console.log('[HomeScreen Effect] Skipping fetchTablesForSelectedVenue: selectedVenueId or user not ready.', { selectedVenueId: selectedVenueId, userReady: !!user?.uid });
    }
  }, [fetchTablesForSelectedVenue, selectedVenueId, user]); // Depend on fetchTablesForSelectedVenue, selectedVenueId, and user


  useEffect(() => {
    if (selectedTableId) {
      const tableToEdit = tablesForSelectedVenue.find(t => t._id === selectedTableId);
      if (tableToEdit) {
        setEditTableNumber(String(tableToEdit.tableNumber));
        setEditEsp32DeviceId(tableToEdit.esp32DeviceId || '');
      }
    } else {
      setEditTableNumber('');
      setEditEsp32DeviceId('');
    }
  }, [selectedTableId, tablesForSelectedVenue]);


  const handleRegisterVenue = async () => {
    if (!user || !user.uid) {
      Alert.alert('Authentication Error', 'User not authenticated.');
      return;
    }
    if (!newVenueName || !newVenueAddress || !newVenueLat || !newVenueLon || !newVenueTablesCount || isNaN(parseInt(newVenueTablesCount, 10))) {
      Alert.alert('Missing Information', 'Please fill in all venue details and a valid number of tables.');
      return;
    }

    setIsRegisteringVenue(true);
    try {
      console.log('[HandleRegisterVenue Debug] User object before getIdToken:', user);
      console.log('[HandleRegisterVenue Debug] Type of user:', typeof user);
      console.log('[HandleRegisterVenue Debug] Does user have getIdToken?', typeof (user as any).getIdToken); // Cast to any for checking method
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

  const handleEditTable = async () => {
    if (!user || !user.uid) {
      Alert.alert('Authentication Error', 'User not authenticated.');
      return;
    }
    if (!selectedTableId) {
      Alert.alert('Selection Error', 'Please select a table to edit.');
      return;
    }
    if (!editTableNumber && !editEsp32DeviceId) {
      Alert.alert('Input Error', 'Please provide a new table number or ESP32 Device ID.');
      return;
    }

    setIsEditingTable(true);
    try {
      console.log('[HandleEditTable Debug] User object before getIdToken:', user);
      console.log('[HandleEditTable Debug] Type of user:', typeof user);
      console.log('[HandleEditTable Debug] Does user have getIdToken?', typeof (user as any).getIdToken); // Cast to any for checking method
      const idToken = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${selectedTableId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          tableNumber: editTableNumber,
          esp32DeviceId: editEsp32DeviceId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update table.');
      }

      const updatedTable = await response.json();
      Alert.alert('Success', `Table "${updatedTable.tableNumber}" updated successfully!`);
      console.log('Updated Table:', updatedTable);

      fetchTablesForSelectedVenue();
    } catch (error: any) {
      console.error('Table update error:', error);
      Alert.alert('Update Failed', `Error: ${error.message}`);
    } finally {
      setIsEditingTable(false);
    }
  };


  const renderVenueItem = ({ item }: { item: Venue }) => (
    <View style={styles.venueItem}>
      <Text style={styles.venueName}>{item.name}</Text>
      <Text style={styles.venueAddress}>{item.address}</Text>
      {item.numberOfTables !== undefined && (
         <Text style={styles.venueDetails}>Tables: {item.numberOfTables}</Text>
      )}
      <Button
        title="View Location"
        onPress={() => navigation.navigate('VenueDetail', { venueId: item._id, venueName: item.name })}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.title}>Welcome to Billiards Hub, {user?.displayName || user?.email}!</Text>
        <Text style={styles.subtitle}>Find a pool table near you:</Text>
        {/* Removed the inline token balance text here as it will be in the header */}


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

            {/* Register New Venue Section (no change) */}
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

            {/* Edit Specific Table Section (CHANGED) */}
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionTitle}>Edit Specific Table</Text>

              {isLoadingVenuesForAdmin ? (
                <ActivityIndicator size="small" color="#0000ff" />
              ) : allVenues.length > 0 ? (
                <>
                  <Text style={styles.pickerLabel}>Select Venue:</Text>
                  <Picker
                    selectedValue={selectedVenueId}
                    onValueChange={(itemValue: string | null) => {
                      setSelectedVenueId(itemValue);
                      setSelectedTableId(null);
                    }}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {allVenues.map((venue) => (
                      <Picker.Item key={venue._id} label={venue.name} value={venue._id} />
                    ))}
                  </Picker>

                  {selectedVenueId && (
                    isLoadingTablesForEdit ? (
                      <ActivityIndicator size="small" color="#0000ff" style={{ marginTop: 10 }} />
                    ) : tablesForSelectedVenue.length > 0 ? (
                      <>
                        <Text style={styles.pickerLabel}>Select Table:</Text>
                        <Picker
                          selectedValue={selectedTableId}
                          onValueChange={(itemValue: string | null) => setSelectedTableId(itemValue)}
                          style={styles.picker}
                          itemStyle={styles.pickerItem}
                        >
                          {tablesForSelectedVenue.map((table) => (
                            <Picker.Item key={table._id} label={`Table ${table.tableNumber} (ID: ${table.esp32DeviceId || 'N/A'})`} value={table._id} />
                          ))}
                        </Picker>
                      </>
                    ) : (
                      <Text style={styles.infoText}>No tables found for this venue. Register some first.</Text>
                    )
                  )}
                </>
              ) : (
                <Text style={styles.infoText}>No venues available. Register a venue first.</Text>
              )}

              {selectedTableId && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="New Table Number (e.g., A1, 2)"
                    value={editTableNumber}
                    onChangeText={setEditTableNumber}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="New ESP32 Device ID (Unique Identifier)"
                    value={editEsp32DeviceId}
                    onChangeText={setEditEsp32DeviceId}
                  />
                  <TouchableOpacity
                    style={styles.registerButton}
                    onPress={handleEditTable}
                    disabled={isEditingTable || !selectedTableId || (!editTableNumber && !editEsp32DeviceId)}
                  >
                    {isEditingTable ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.registerButtonText}>Update Table</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
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
  tokenBalanceText: { // This style is no longer directly used in HomeScreen, but kept for reference
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

export default HomeScreen;
