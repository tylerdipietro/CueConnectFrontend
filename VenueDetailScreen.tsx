import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Alert, Button, SafeAreaView, TouchableOpacity } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import io from 'socket.io-client';

// Define the type for your navigation stack parameters (must match RootStackParamList in App.tsx)
type RootStackParamList = {
  Home: undefined;
  VenueDetail: { venueId: string; venueName: string };
};

type VenueDetailScreenProps = StackScreenProps<RootStackParamList, 'VenueDetail'>;

// Backend base URL (must match the one in App.tsx)
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com'; // Use your actual deployed backend URL
const SOCKET_IO_URL = BACKEND_BASE_URL; // Socket.IO server is usually on the same URL

// Define a simplified User type for populated queue items
interface QueueUser {
  displayName: string;
  _id: string; // Firebase UID from backend, needed for consistency and comparison
}

interface Table {
  _id: string;
  venueId: string;
  tableNumber: string | number;
  esp32DeviceId?: string;
  status: 'available' | 'occupied' | 'queued' | 'maintenance';
  currentSessionId?: string;
  queue: QueueUser[]; // Now an array of QueueUser objects
}

const VenueDetailScreen = ({ route }: VenueDetailScreenProps): JSX.Element => {
  const { venueId, venueName } = route.params;
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const currentUserUid = auth().currentUser?.uid;

  // Function to fetch tables for the specific venue
  const fetchTablesForVenue = useCallback(async () => {
    setIsLoadingTables(true);
    setErrorMsg(null);
    try {
      const user = auth().currentUser;
      if (!user) {
        throw new Error('User not authenticated.');
      }
      const idToken = await user.getIdToken(true);

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

  // Socket.IO setup for real-time queue updates
  useEffect(() => {
    const socket = io(SOCKET_IO_URL, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend server:', socket.id);
      socket.emit('registerForUpdates', currentUserUid);
      socket.emit('joinVenueRoom', venueId); // Join venue-specific room
    });

    socket.on('queueUpdate', (data: { tableId: string; newQueue: QueueUser[]; status: Table['status'] }) => {
      console.log(`[Socket.IO] Received queueUpdate event for table ${data.tableId}. New queue payload:`, data.newQueue); // NEW DEBUG LOG
      setTables(prevTables =>
        prevTables.map(table =>
          table._id === data.tableId
            ? { ...table, queue: data.newQueue, status: data.status }
            : table
        )
      );
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected from backend server.');
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection Error:', err.message);
    });

    return () => {
      socket.emit('leaveVenueRoom', venueId); // Leave venue-specific room
      socket.disconnect();
      console.log('[Socket.IO] Disconnected client socket on unmount.');
    };
  }, [venueId, currentUserUid]);

  useEffect(() => {
    fetchTablesForVenue();
  }, [fetchTablesForVenue]);

  const handleJoinQueue = async (table: Table) => {
    if (!currentUserUid) {
      Alert.alert('Error', 'You must be logged in to join a queue.');
      return;
    }
    // Robust check: compare UIDs as strings
    if (table.queue.some(userInQueue => userInQueue._id.toString() === currentUserUid)) {
      Alert.alert('Info', `You are already in the queue for Table ${table.tableNumber}.`);
      return;
    }

    try {
      const user = auth().currentUser;
      const idToken = await user.getIdToken(true);

      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${table._id}/join-queue`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to join queue.');
      }
      Alert.alert('Success', `You have joined the queue for Table ${table.tableNumber}!`);
    } catch (error: any) {
      console.error('Error joining queue:', error);
      Alert.alert('Error', `Failed to join queue: ${error.message}`);
    }
  };

  const handleLeaveQueue = async (table: Table) => {
    if (!currentUserUid) {
      Alert.alert('Error', 'You must be logged in to leave a queue.');
      return;
    }
    // Robust check: compare UIDs as strings
    if (!table.queue.some(userInQueue => userInQueue._id.toString() === currentUserUid)) {
      Alert.alert('Info', `You are not in the queue for Table ${table.tableNumber}.`);
      return;
    }

    try {
      const user = auth().currentUser;
      const idToken = await user.getIdToken(true);

      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${table._id}/leave-queue`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to leave queue.');
      }
      Alert.alert('Success', `You have left the queue for Table ${table.tableNumber}.`);
    } catch (error: any) {
      console.error('Error leaving queue:', error);
      Alert.alert('Error', `Failed to leave queue: ${error.message}`);
    }
  };

  const handlePayForTable = (table: Table) => {
    Alert.alert('Pay for Table', `You want to pay for Table ${table.tableNumber} at ${venueName}. This functionality is not yet implemented.`);
  };

  const renderTableItem = ({ item }: { item: Table }) => {
    // --- DEBUGGING LOGS ---
    console.log(`[DEBUG renderTableItem] Table ${item.tableNumber} Queue:`, item.queue);
    console.log(`[DEBUG renderTableItem] Current User UID:`, currentUserUid);
    const isInQueue = item.queue.some(userInQueue => {
      // Ensure both sides of comparison are strings
      const userInQueueIdString = String(userInQueue._id);
      const currentUserUidString = String(currentUserUid);
      console.log(`[DEBUG renderTableItem] Comparing userInQueue._id: "${userInQueueIdString}" with currentUserUid: "${currentUserUidString}"`);
      return userInQueueIdString === currentUserUidString;
    });
    console.log(`[DEBUG renderTableItem] Is current user in queue for Table ${item.tableNumber}?`, isInQueue);
    // --- END DEBUGGING LOGS ---


    const queuePosition = isInQueue ? item.queue.findIndex(userInQueue => String(userInQueue._id) === String(currentUserUid)) + 1 : null;

    return (
      <View style={styles.tableItem}>
        <Text style={styles.tableNumber}>Table {item.tableNumber}</Text>
        <Text style={styles.tableStatus}>Status: {item.status.toUpperCase()}</Text>
        {item.esp32DeviceId && <Text style={styles.tableDetail}>Device ID: {item.esp32DeviceId}</Text>}

        <View style={styles.queueInfo}>
          <Text style={styles.queueText}>
            Queue: {item.queue.length} people
          </Text>
          {isInQueue && queuePosition && (
            <Text style={styles.queuePositionText}>
              Your position: {queuePosition}
            </Text>
          )}

          {item.queue.length > 0 && (
            <View style={styles.queueListContainer}>
              <Text style={styles.queueListTitle}>Current Queue:</Text>
              {item.queue.map((userInQueue, index) => (
                <Text key={userInQueue._id} style={styles.queueListItem}>
                  {index + 1}. {userInQueue.displayName || 'Unnamed User'} {String(userInQueue._id) === String(currentUserUid) ? '(You)' : ''}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.tableButtonContainer}>
          {isInQueue ? (
            <TouchableOpacity
              style={[styles.queueButton, styles.leaveQueueButton]}
              onPress={() => handleLeaveQueue(item)}
            >
              <Text style={styles.queueButtonText}>Leave Queue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.queueButton, styles.joinQueueButton]}
              onPress={() => handleJoinQueue(item)}
            >
              <Text style={styles.queueButtonText}>Join Queue</Text>
            </TouchableOpacity>
          )}
          <Button title="Pay for Table" onPress={() => handlePayForTable(item)} />
        </View>
      </View>
    );
  };

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
  queueInfo: {
    marginTop: 5,
    marginBottom: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#e0f7fa', // Light blue background for queue info
    borderRadius: 5,
  },
  queueText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#00796b', // Darker green-blue
  },
  queuePositionText: {
    fontSize: 14,
    color: '#004d40',
    marginTop: 3,
  },
  queueListContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#b2ebf2', // Lighter blue for separator
  },
  queueListTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#004d40',
    marginBottom: 4,
  },
  queueListItem: {
    fontSize: 14,
    color: '#333',
    marginLeft: 10, // Indent list items
    marginBottom: 2,
  },
  tableButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  queueButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  joinQueueButton: {
    backgroundColor: '#007bff',
  },
  leaveQueueButton: {
    backgroundColor: '#dc3545',
  },
  queueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default VenueDetailScreen;
