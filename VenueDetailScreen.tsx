import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Alert, Button, SafeAreaView } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import auth from '@react-native-firebase/auth'; // Import auth for getIdToken

// Define the type for your navigation stack parameters (must match RootStackParamList in App.tsx)
type RootStackParamList = {
  Home: undefined; // No params needed for Home when navigating from VenueDetail
  VenueDetail: { venueId: string; venueName: string };
};

// Define the props for VenueDetailScreen, including navigation and route params
type VenueDetailScreenProps = StackScreenProps<RootStackParamList, 'VenueDetail'>;

// Backend base URL (must match the one in App.tsx)
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

interface Table {
  _id: string;
  venueId: string;
  tableNumber: string | number;
  esp32DeviceId?: string;
  status: 'available' | 'occupied' | 'queued' | 'maintenance';
  currentSessionId?: string;
  queue?: string[]; // Array of user IDs in queue
  // Add any other table specific properties you have in your Table model
}

const VenueDetailScreen = ({ route }: VenueDetailScreenProps): JSX.Element => {
  const { venueId, venueName } = route.params;
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Function to fetch tables for the specific venue
  const fetchTablesForVenue = useCallback(async () => {
    setIsLoadingTables(true);
    setErrorMsg(null);
    try {
      const user = auth().currentUser; // Get the current authenticated Firebase user
      if (!user) {
        throw new Error('User not authenticated.');
      }
      const idToken = await user.getIdToken(true); // Force refresh the token

      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${venueId}/tables`, {
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
      setTables(data);
      console.log(`[API] Tables fetched for venue ${venueName}:`, data);
    } catch (error: any) {
      console.error('[Fetch Tables Error]', error);
      setErrorMsg(`Failed to fetch tables: ${error.message || 'Network error'}.`);
      setTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  }, [venueId, venueName]);

  // Fetch tables when the component mounts or venueId changes
  useEffect(() => {
    fetchTablesForVenue();
  }, [fetchTablesForVenue]);

  const handleJoinQueue = (table: Table) => {
    Alert.alert('Join Queue', `You want to join the queue for Table ${table.tableNumber} at ${venueName}.`);
    // TODO: Implement actual backend call to join queue
  };

  const handlePayForTable = (table: Table) => {
    Alert.alert('Pay for Table', `You want to pay for Table ${table.tableNumber} at ${venueName}.`);
    // TODO: Implement actual backend call for payment
  };

  const renderTableItem = ({ item }: { item: Table }) => (
    <View style={styles.tableItem}>
      <Text style={styles.tableNumber}>Table {item.tableNumber}</Text>
      <Text style={styles.tableStatus}>Status: {item.status.toUpperCase()}</Text>
      {item.esp32DeviceId && <Text style={styles.tableDetail}>Device ID: {item.esp32DeviceId}</Text>}
      {item.queue && item.queue.length > 0 && (
        <Text style={styles.tableDetail}>Queue: {item.queue.length} people</Text>
      )}
      <View style={styles.tableButtonContainer}>
        <Button title="Join Queue" onPress={() => handleJoinQueue(item)} />
        <Button title="Pay for Table" onPress={() => handlePayForTable(item)} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Tables at {venueName}</Text>

      {isLoadingTables ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Loading tables...</Text>
        </View>
      ) : errorMsg ? (
        <Text style={styles.errorText}>{errorMsg}</Text>
      ) : tables.length > 0 ? (
        <FlatList
          data={tables}
          renderItem={renderTableItem}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.tableList}
        />
      ) : (
        <Text style={styles.noTablesText}>No tables found for this venue.</Text>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
  noTablesText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  tableList: {
    paddingBottom: 20,
  },
  tableItem: {
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
  tableNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  tableStatus: {
    fontSize: 16,
    color: '#555',
    marginBottom: 5,
  },
  tableDetail: {
    fontSize: 14,
    color: '#777',
    marginBottom: 3,
  },
  tableButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
});

export default VenueDetailScreen;
