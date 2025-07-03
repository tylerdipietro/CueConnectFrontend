import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Button, Alert, TouchableOpacity } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../App';
import { getSocketIO } from '../../backend/services/socketService'; // Corrected path assumption for Socket.IO setup
import auth from '@react-native-firebase/auth'; // Import firebase auth

// Backend base URL
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

type VenueDetailScreenProps = StackScreenProps<RootStackParamList, 'VenueDetail'>;

interface Table {
  _id: string;
  tableNumber: string | number;
  status: 'available' | 'occupied' | 'queued' | 'maintenance';
  queue: { _id: string; displayName: string }[];
  player1Details?: { _id: string; displayName: string };
  player2Details?: { _id: string; displayName: string };
  esp32DeviceId?: string; // Add esp32DeviceId to Table interface
}

interface Venue {
  _id: string;
  name: string;
  address: string;
  perGameCost: number; // Add perGameCost to Venue interface
}

const VenueDetailScreen = ({ route, navigation }: VenueDetailScreenProps) => {
  const { venueId, venueName } = route.params;
  const [venue, setVenue] = useState<Venue | null>(null); // State to store venue details
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const currentUser = auth().currentUser; // Get current Firebase user

  const fetchVenueDetails = useCallback(async () => {
    if (!currentUser) {
      setError('User not authenticated.');
      setLoading(false);
      return;
    }

    try {
      const idToken = await currentUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${venueId}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch venue details.');
      }
      const data: Venue = await response.json();
      setVenue(data);
    } catch (err: any) {
      console.error('Error fetching venue details:', err);
      setError('Failed to load venue details.');
    }
  }, [venueId, currentUser]);


  const fetchTables = useCallback(async () => {
    if (!currentUser) {
      setError('User not authenticated.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const idToken = await currentUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${venueId}/tables-detailed`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tables for venue.');
      }

      const data: Table[] = await response.json();
      setTables(data);
    } catch (err: any) {
      console.error('Error fetching tables:', err);
      setError('Failed to load tables.');
    } finally {
      setLoading(false);
    }
  }, [venueId, currentUser]);

  useEffect(() => {
    fetchVenueDetails(); // Fetch venue details once
    fetchTables(); // Initial fetch of tables
  }, [fetchVenueDetails, fetchTables]);

  useEffect(() => {
    // Set up WebSocket listener for table updates
    const socket = getSocketIO(); // Assuming getSocketIO returns the initialized socket instance
    if (socket) {
      console.log(`[Socket.IO] VenueDetailScreen: Joining venue room ${venueId}`);
      socket.emit('joinVenueRoom', venueId);

      // Handle initial venue state (if emitted upon join)
      socket.on('initialVenueState', (initialTables: Table[]) => {
        console.log('[Socket.IO] Received initialVenueState:', initialTables);
        setTables(initialTables);
      });

      // Handle live table updates for this venue
      socket.on('tableUpdate', (updatedTable: Table) => {
        console.log('[Socket.IO] Received tableUpdate:', updatedTable);
        setTables(prevTables =>
          prevTables.map(table =>
            table._id === updatedTable._id ? updatedTable : table
          )
        );
      });
    }

    return () => {
      if (socket) {
        console.log(`[Socket.IO] VenueDetailScreen: Leaving venue room ${venueId}`);
        socket.emit('leaveVenueRoom', venueId);
        socket.off('tableUpdate'); // Clean up listener
        socket.off('initialVenueState'); // Clean up listener
      }
    };
  }, [venueId]);


  const handleJoinQueue = async (tableId: string) => {
    if (!currentUser) {
      Alert.alert('Authentication Error', 'You must be logged in to join a queue.');
      return;
    }

    try {
      const idToken = await currentUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${tableId}/join-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId: currentUser.uid }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to join queue.');
      }

      Alert.alert('Success', 'You have joined the queue!');
    } catch (err: any) {
      console.error('Error joining queue:', err);
      Alert.alert('Error', `Failed to join queue: ${err.message}`);
    }
  };

  const handleLeaveQueue = async (tableId: string) => {
    if (!currentUser) {
      Alert.alert('Authentication Error', 'You must be logged in to leave a queue.');
      return;
    }

    try {
      const idToken = await currentUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${tableId}/leave-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId: currentUser.uid }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to leave queue.');
      }

      Alert.alert('Success', 'You have left the queue.');
    } catch (err: any) {
      console.error('Error leaving queue:', err);
      Alert.alert('Error', `Failed to leave queue: ${err.message}`);
    }
  };

  const handleDirectJoin = async (tableId: string) => {
    if (!currentUser) {
      Alert.alert('Authentication Error', 'You must be logged in to join a game directly.');
      return;
    }
    Alert.alert(
      'Confirm Direct Join',
      'Are you sure you want to directly join this table? This will start a game if a second player is present.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async () => {
            try {
              const idToken = await currentUser.getIdToken(true);
              const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${tableId}/direct-join`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ userId: currentUser.uid }),
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to direct join table.');
              }

              const { message, sessionId } = await response.json();
              if (sessionId) {
                Alert.alert('Game Started!', 'You have successfully joined the game directly.');
                // Here, you might navigate to a game-in-progress screen or update UI
              } else {
                Alert.alert('Joined!', message); // "Waiting for a second player to join directly."
              }
            } catch (err: any) {
              console.error('Error direct joining table:', err);
              Alert.alert('Error', `Failed to join table directly: ${err.message}`);
            }
          },
        },
      ]
    );
  };

  const handlePayForTable = (table: Table) => {
    // Check if venue data is loaded and has perGameCost
    if (!venue || typeof venue.perGameCost === 'undefined') {
      Alert.alert('Error', 'Venue cost information not available. Please try again.');
      return;
    }
    if (!table.esp32DeviceId) {
      Alert.alert('Missing Device ID', 'This table does not have an associated ESP32 device ID. Cannot activate.');
      return;
    }

    // Navigate to the new PayForTableScreen
    navigation.navigate('PayForTable', {
      tableId: table._id,
      tableNumber: table.tableNumber,
      venueId: venue._id,
      venueName: venue.name,
      perGameCost: venue.perGameCost,
      esp32DeviceId: table.esp32DeviceId,
    });
  };

  const renderTableItem = ({ item }: { item: Table }) => {
    const isCurrentUserInQueue = item.queue.some(user => user._id === currentUser?.uid);
    const isCurrentUserPlayer1 = item.player1Details?._id === currentUser?.uid;
    const isCurrentUserPlayer2 = item.player2Details?._id === currentUser?.uid;
    const isCurrentUserPlaying = isCurrentUserPlayer1 || isCurrentUserPlayer2;

    return (
      <View style={styles.tableCard}>
        <Text style={styles.tableNumber}>Table {item.tableNumber}</Text>
        <Text style={styles.tableStatus}>Status: {item.status.replace(/_/g, ' ')}</Text>

        {item.player1Details && (
          <Text style={styles.playerInfo}>
            Player 1: {item.player1Details.displayName}
            {isCurrentUserPlayer1 ? ' (You)' : ''}
          </Text>
        )}
        {item.player2Details && (
          <Text style={styles.playerInfo}>
            Player 2: {item.player2Details.displayName}
            {isCurrentUserPlayer2 ? ' (You)' : ''}
          </Text>
        )}

        {item.queue.length > 0 && (
          <Text style={styles.queueInfo}>
            Queue: {item.queue.map(user => user.displayName + (user._id === currentUser?.uid ? ' (You)' : '')).join(', ')}
          </Text>
        )}

        {item.status === 'available' && !isCurrentUserPlaying && (
          <View style={styles.buttonRow}>
            {!isCurrentUserInQueue ? (
              <TouchableOpacity style={styles.actionButton} onPress={() => handleJoinQueue(item._id)}>
                <Text style={styles.buttonText}>Join Queue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionButtonRed} onPress={() => handleLeaveQueue(item._id)}>
                <Text style={styles.buttonText}>Leave Queue</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={() => handleDirectJoin(item._id)}>
              <Text style={styles.buttonText}>Direct Join</Text>
            </TouchableOpacity>
            {item.esp32DeviceId && venue && typeof venue.perGameCost !== 'undefined' && (
              <TouchableOpacity style={styles.actionButtonGreen} onPress={() => handlePayForTable(item)}>
                <Text style={styles.buttonText}>Pay for Table ({venue.perGameCost} tokens)</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {item.status === 'occupied' && !isCurrentUserPlaying && !isCurrentUserInQueue && (
          <Text style={styles.infoText}>This table is currently occupied.</Text>
        )}
        {item.status === 'maintenance' && (
          <Text style={styles.infoText}>This table is under maintenance.</Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading tables...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchTables} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.venueTitle}>{venueName}</Text>
      {venue && <Text style={styles.venueAddress}>{venue.address}</Text>}
      <Text style={styles.sectionHeader}>Available Tables:</Text>
      <FlatList
        data={tables}
        renderItem={renderTableItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.tableList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  venueTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
    color: '#333',
  },
  venueAddress: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  tableList: {
    paddingBottom: 20,
  },
  tableCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  tableNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#007bff',
  },
  tableStatus: {
    fontSize: 16,
    color: '#555',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  playerInfo: {
    fontSize: 15,
    color: '#333',
    marginBottom: 3,
  },
  queueInfo: {
    fontSize: 14,
    color: '#777',
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    flexWrap: 'wrap', // Allow buttons to wrap to next line
  },
  actionButton: {
    backgroundColor: '#007bff',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginVertical: 5, // Add vertical margin for wrapping
    minWidth: 100, // Ensure minimum width for buttons
    alignItems: 'center',
  },
  actionButtonRed: {
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginVertical: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  actionButtonGreen: {
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginVertical: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
  },
});

export default VenueDetailScreen;
