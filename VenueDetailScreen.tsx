import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Alert, Button, SafeAreaView, TouchableOpacity, Modal } from 'react-native';
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
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com'; 
const SOCKET_IO_URL = BACKEND_BASE_URL; // Socket.IO server is usually on the same URL

// Define a simplified User type for populated queue items
interface QueueUser {
  displayName: string;
  _id: string; // Firebase UID from backend, needed for consistency and comparison
}

interface CurrentPlayers {
  player1Id: string | null;
  player2Id: string | null;
  player1DisplayName?: string; // Added for populated display name
  player2DisplayName?: string; // Added for populated display name
}

interface Table {
  _id: string;
  venueId: string;
  tableNumber: string | number;
  esp32DeviceId?: string;
  status: 'available' | 'occupied' | 'queued' | 'in_play' | 'awaiting_confirmation' | 'maintenance' | 'out_of_order';
  currentPlayers: CurrentPlayers; // Track current active players
  currentSessionId?: string;
  queue: QueueUser[]; // Now an array of QueueUser objects
}

const VenueDetailScreen = ({ route }: VenueDetailScreenProps): JSX.Element => {
  const { venueId, venueName } = route.params;
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const currentUser = auth().currentUser; // Get current user object
  const currentUserUid = currentUser?.uid;
  const currentUserDisplayName = currentUser?.displayName || currentUser?.email || 'You';

  // State for win confirmation modal
  const [winClaimModalVisible, setWinClaimModalVisible] = useState(false);
  const [claimedWinDetails, setClaimedWinDetails] = useState<{
    tableId: string;
    tableNumber: string | number;
    winnerId: string;
    winnerDisplayName: string;
  } | null>(null);

  const socketRef = useRef<any | null>(null); // Use ref for socket instance

  // Your existing syncUserToBackend function
  const syncUserToBackend = async () => {
      const user = auth().currentUser;
      if (!user) return;

      try {
        const idToken = await user.getIdToken(true);
        const response = await fetch(`${BACKEND_BASE_URL}/api/users/sync`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName: user.displayName || user.email || 'Unnamed User',
          }),
        });
        if (!response.ok) {
          console.error('Error syncing user to backend:', response.status, await response.text());
        } else {
          console.log('User synced to backend successfully.');
        }
      } catch (error) {
        console.error('Network error during user sync:', error);
      }
    };


  // Function to fetch tables for the specific venue
  const fetchTablesForVenue = useCallback(async () => {
    setIsLoadingTables(true);
    setErrorMsg(null);
    try {
      if (!currentUser) {
        throw new Error('User not authenticated.');
      }
      const idToken = await currentUser.getIdToken(true);

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
      console.log(`[API] Tables fetched for venue ${venueName}.`);
    } catch (error: any) {
      console.error('[Fetch Tables Error]', error);
      setErrorMsg(`Failed to fetch tables: ${error.message || 'Network error'}.`);
      setTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  }, [venueId, currentUser]);

  // Fetch admin status when component mounts
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken(true);
          const response = await fetch(`${BACKEND_BASE_URL}/api/user/profile`, {
            headers: { 'Authorization': `Bearer ${idToken}` },
          });
          if (response.ok) {
            const profileData = await response.json();
            setIsAdmin(profileData.isAdmin || false);
          } else {
            console.warn('Failed to fetch user profile for admin check:', response.status);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error('Error fetching admin status:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    };
    checkAdminStatus();
  }, [currentUserUid, currentUser]);

  // Socket.IO setup for real-time queue and table status updates
  useEffect(() => {
    if (!currentUserUid) return;

    const socket = io(SOCKET_IO_URL, {
      transports: ['websocket'],
    });
    socketRef.current = socket; // Store socket instance in ref

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend server:', socket.id);
      (async () => {
          await syncUserToBackend(); // Ensure DB write finishes before anything else
          socket.emit('registerForUpdates', currentUserUid);
          socket.emit('joinVenueRoom', venueId); // Now safe to join room
      })();
    });

    socket.on('initialVenueState', (tables: Table[]) => {
      console.log('[FRONTEND-SOCKET] Received initialVenueState.');
      console.log('[FRONTEND-SOCKET] Raw initialVenueState data:', JSON.stringify(tables, null, 2));
      setTables(tables);
    });

    socket.on('queueUpdate', (data: Table) => { // Expecting full table object now from backend
      console.log(`[FRONTEND-SOCKET] Received queueUpdate for table ${data._id}.`);
      console.log('[FRONTEND-SOCKET] Raw received queueUpdate data:', JSON.stringify(data, null, 2));
      console.log('[FRONTEND-SOCKET] Player1 Display Name from queueUpdate data:', data.currentPlayers?.player1DisplayName);
      console.log('[FRONTEND-SOCKET] Player2 Display Name from queueUpdate data:', data.currentPlayers?.player2DisplayName);
      console.log('[FRONTEND-SOCKET] Queue users from queueUpdate data:', data.queue.map(u => ({ _id: u._id, displayName: u.displayName })));
      setTables(prevTables => {
        return prevTables.map(table =>
          table._id === data._id
            ? data // Replace the entire table object with the new populated one
            : table
        );
      });
    });

    socket.on('tableStatusUpdate', (data: Table) => {
      console.log(`[FRONTEND-SOCKET] Received tableStatusUpdate for table ${data._id}.`);
      console.log('[FRONTEND-SOCKET] Raw received tableStatusUpdate data:', JSON.stringify(data, null, 2));
      console.log('[FRONTEND-SOCKET] Player1 Display Name from tableStatusUpdate data:', data.currentPlayers?.player1DisplayName);
      console.log('[FRONTEND-SOCKET] Player2 Display Name from tableStatusUpdate data:', data.currentPlayers?.player2DisplayName);
      console.log('[FRONTEND-SOCKET] Queue users from tableStatusUpdate data:', data.queue.map(u => ({ _id: u._id, displayName: u.displayName })));

      setTables(prevTables =>
        prevTables.map(table =>
          table._id === data._id ? data : table // Replace the entire table object with the fully populated one
        )
      );
    });

    socket.on('winClaimedNotification', (data: {
      tableId: string;
      tableNumber: string | number;
      winnerId: string;
      winnerDisplayName: string;
      message: string;
    }) => {
      console.log('[FRONTEND-SOCKET] Received winClaimedNotification.');
      setClaimedWinDetails(data);
      setWinClaimModalVisible(true);
    });

    socket.on('winClaimSent', (data: { tableId: string; tableNumber: string | number; message: string; }) => {
      Alert.alert('Win Claim Sent', data.message);
    });

    socket.on('winConfirmed', (data: { tableId: string; tableNumber: string | number; message: string; }) => {
      Alert.alert('Win Confirmed', data.message);
    });

    socket.on('gameEnded', (data: { tableId: string; tableNumber: string | number; message: string; }) => {
      Alert.alert('Game Over', data.message);
    });

    socket.on('tableJoined', (data: { tableId: string; tableNumber: string | number; message: string; playerSlot: string; }) => {
      Alert.alert('Table Joined', data.message);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected from backend server.');
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection Error:', err.message);
    });

    return () => {
      socket.emit('leaveVenueRoom', venueId);
      socket.disconnect();
      console.log('[Socket.IO] Disconnected client socket on unmount.');
    };
  }, [venueId, currentUserUid]);

  useEffect(() => {
    fetchTablesForVenue();
  }, [fetchTablesForVenue]);

  // --- API Call Functions ---

  const sendAuthenticatedRequest = useCallback(async (path: string, method: string = 'POST', body?: any) => {
    if (!currentUserUid) {
      throw new Error('User not authenticated.');
    }
    const idToken = await currentUser?.getIdToken(true);
    if (!idToken) {
      throw new Error('Failed to get authentication token.');
    }

    const headers: HeadersInit = {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${BACKEND_BASE_URL}/api${path}`, config);

    if (!response.ok) {
      // Always try to parse JSON error message, even if response.ok is false
      const errorData = await response.json().catch(() => ({ message: response.statusText || 'Unknown error' }));
      throw new Error(errorData.message || `HTTP Error: ${response.status}`);
    }

    // Expecting JSON response for all authenticated requests
    return response.json();
  }, [currentUser, currentUserUid]);


  const handleJoinTable = async (table: Table) => {
    try {
      await sendAuthenticatedRequest(`/tables/${table._id}/join-table`);
      // UI update is handled by socket.io tableStatusUpdate
    } catch (error: any) {
      console.error('Error joining table:', error);
      Alert.alert('Error', `Failed to join table: ${error.message}`);
    }
  };

  const handleJoinQueue = async (table: Table) => {
    try {
      await sendAuthenticatedRequest(`/tables/${table._id}/join-queue`);
      // UI update handled by socket.io queueUpdate or tableStatusUpdate
    } catch (error: any) {
      console.error('Error joining queue:', error);
      Alert.alert('Error', `Failed to join queue: ${error.message}`);
    }
  };

  const handleLeaveQueue = async (table: Table) => {
    try {
      await sendAuthenticatedRequest(`/tables/${table._id}/leave-queue`);
      // UI update handled by socket.io queueUpdate or tableStatusUpdate
    } catch (error: any) {
      console.error('Error leaving queue:', error);
      Alert.alert('Error', `Failed to leave queue: ${error.message}`);
    }
  };

  const handlePayForTable = (table: Table) => {
    Alert.alert('Pay for Table', `You want to pay for Table ${table.tableNumber} at ${venueName}. This functionality is not yet implemented.`);
  };

  const handleClearQueue = async (table: Table) => {
    Alert.alert(
      "Clear Queue",
      `Are you sure you want to clear the queue for Table ${table.tableNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          onPress: async () => {
            try {
              await sendAuthenticatedRequest(`/tables/${table._id}/clear-queue`);
              // UI update handled by socket.io queueUpdate or tableStatusUpdate
            } catch (error: any) {
              console.error('Error clearing queue:', error);
              Alert.alert('Error', `Failed to clear queue: ${error.message}`);
            }
          },
          style: "destructive"
        }
      ],
      { cancelable: true }
    );
  };

  // handleClaimWin
  const handleClaimWin = async (table: Table) => {
    if (!currentUserUid) return;

    // Safely access currentPlayers for the check
    const isPlayer = table.currentPlayers.player1Id === currentUserUid || table.currentPlayers.player2Id === currentUserUid;
    if (!isPlayer) {
      Alert.alert('Error', 'You must be an active player to claim a win.');
      return;
    }

    Alert.alert(
      "Claim Victory",
      `Are you sure you won the game on Table ${table.tableNumber}? This will notify your opponent for confirmation.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Claim Win",
          onPress: async () => {
            try {
              await sendAuthenticatedRequest(`/tables/${table._id}/claim-win`);
              // Backend will send socket event for confirmation status
            } catch (error: any) {
              console.error('Error claiming win:', error);
              Alert.alert('Error', `Failed to claim win: ${error.message}`);
            }
          },
          style: "default"
        }
      ],
      { cancelable: true }
    );
  };

  // handleConfirmWin (from modal)
  const handleConfirmWin = async () => {
    if (!claimedWinDetails || !currentUserUid) return;

    try {
      await sendAuthenticatedRequest(`/tables/${claimedWinDetails.tableId}/confirm-win`, 'POST', {
        winnerId: claimedWinDetails.winnerId,
      });
      setWinClaimModalVisible(false);
      setClaimedWinDetails(null);
      // Backend will send tableStatusUpdate and inviteNextPlayer
    } catch (error: any) {
      console.error('Error confirming win:', error);
      Alert.alert('Error', `Failed to confirm win: ${error.message}`);
    }
  };

  // handleDeclineWin (from modal, optional, but good for UX)
  const handleDeclineWin = () => {
    // For simplicity, we're not implementing a "decline win" endpoint.
    // In a real app, this would send a dispute to the backend.
    Alert.alert('Win Disputed', 'You have disputed the win. (Functionality not fully implemented)');
    setWinClaimModalVisible(false);
    setClaimedWinDetails(null);
  };

  // NEW: handleRemovePlayer
  const handleRemovePlayer = async (tableId: string, playerId: string, playerName: string, tableNumber: string | number) => {
    Alert.alert(
      "Remove Player",
      `Are you sure you want to remove ${playerName} from Table ${tableNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          onPress: async () => {
            try {
              await sendAuthenticatedRequest(`/tables/${tableId}/remove-player`, 'POST', {
                playerIdToRemove: playerId,
              });
              // UI update is handled by socket.io tableStatusUpdate
              Alert.alert('Success', `${playerName} has been removed from Table ${tableNumber}.`);
            } catch (error: any) {
              console.error('Error removing player:', error);
              Alert.alert('Error', `Failed to remove ${playerName}: ${error.message}`);
            }
          },
          style: "destructive"
        }
      ],
      { cancelable: true }
    );
  };


  const renderTableItem = ({ item }: { item: Table }) => {
    // Safely access currentPlayers, providing a default empty object if it's undefined/null
    const currentPlayersSafe = item.currentPlayers || { player1Id: null, player2Id: null, player1DisplayName: undefined, player2DisplayName: undefined } as CurrentPlayers;

    console.log(`[FRONTEND-RENDER] Table ${item.tableNumber} currentPlayersSafe (at render):`, JSON.stringify(currentPlayersSafe, null, 2));
    console.log(`[FRONTEND-RENDER] Table ${item.tableNumber} item.queue (at render):`, JSON.stringify(item.queue, null, 2));
    console.log(`[FRONTEND-RENDER] currentUserUid (at render): ${currentUserUid}`);
    console.log(`[FRONTEND-RENDER] currentUserDisplayName (at render): ${currentUserDisplayName}`);


    const numPlayers = (currentPlayersSafe.player1Id ? 1 : 0) + (currentPlayersSafe.player2Id ? 1 : 0);
    const isCurrentUserPlaying = currentPlayersSafe.player1Id === currentUserUid || currentPlayersSafe.player2Id === currentUserUid;
    const isCurrentUserInQueue = item.queue.some(userInQueue => String(userInQueue._id) === String(currentUserUid));

    // Determine primary button text and action
    let primaryButtonText = '';
    let primaryButtonAction: () => void = () => {};
    let primaryButtonColor = '#007bff'; // Default blue for join

    if (isCurrentUserPlaying) {
        primaryButtonText = 'I WON';
        primaryButtonAction = () => handleClaimWin(item);
        primaryButtonColor = '#28a745';
    } else if (item.queue.length === 0) { // No one in queue, so can either join directly or fill a spot
        if (numPlayers === 0 && item.status === 'available') {
            primaryButtonText = 'Join Table';
            primaryButtonAction = () => handleJoinTable(item);
            primaryButtonColor = '#007bff';
        } else if (numPlayers === 1 && item.status === 'in_play') {
            primaryButtonText = 'Join Table'; // Second player joining an in-play game
            primaryButtonAction = () => handleJoinTable(item);
            primaryButtonColor = '#007bff';
        } else {
            // Table is full (numPlayers === 2) AND queue is empty, but status is not right for direct join
            // Or table is in other states (maintenance etc.)
            primaryButtonText = 'N/A';
            primaryButtonAction = () => Alert.alert('Info', 'This action is not available for this table at the moment.');
            primaryButtonColor = '#6c757d';
        }
    } else if (isCurrentUserInQueue) { // User is in queue
        primaryButtonText = 'Leave Queue';
        primaryButtonAction = () => handleLeaveQueue(item);
        primaryButtonColor = '#dc3545';
    } else { // Table is full (or has a queue), and user is not in queue
        primaryButtonText = 'Join Queue';
        primaryButtonAction = () => handleJoinQueue(item);
        primaryButtonColor = '#17a2b8';
    }

    const queuePosition = isCurrentUserInQueue ? item.queue.findIndex(userInQueue => String(userInQueue._id) === String(currentUserUid)) + 1 : null;

    // Player display names: Now directly use the populated display names from currentPlayersSafe
    // Fallback to 'Unknown Player' if displayName is not provided by backend.
    const player1DisplayName = currentPlayersSafe.player1Id ? (currentPlayersSafe.player1Id === currentUserUid ? `${currentUserDisplayName} (You)` : (currentPlayersSafe.player1DisplayName || 'Unknown Player')) : 'Empty';
    const player2DisplayName = currentPlayersSafe.player2Id ? (currentPlayersSafe.player2Id === currentUserUid ? `${currentUserDisplayName} (You)` : (currentPlayersSafe.player2DisplayName || 'Unknown Player')) : 'Empty';

    return (
      <View style={styles.tableItem}>
        <Text style={styles.tableNumber}>Table {item.tableNumber}</Text>
        <Text style={styles.tableStatus}>Status: {item.status.toUpperCase()}</Text>
        {item.esp32DeviceId && <Text style={styles.tableDetail}>Device ID: {item.esp32DeviceId}</Text>}

        <View style={styles.playersInfo}>
            <View style={styles.playerLine}>
                <Text style={styles.playerText}>Player 1: {player1DisplayName}</Text>
                {isAdmin && currentPlayersSafe.player1Id && (
                    <TouchableOpacity
                        style={styles.removePlayerButton}
                        onPress={() => handleRemovePlayer(item._id, currentPlayersSafe.player1Id!, player1DisplayName, item.tableNumber)}
                    >
                        <Text style={styles.removePlayerButtonText}>Remove</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.playerLine}>
                <Text style={styles.playerText}>Player 2: {player2DisplayName}</Text>
                {isAdmin && currentPlayersSafe.player2Id && (
                    <TouchableOpacity
                        style={styles.removePlayerButton}
                        onPress={() => handleRemovePlayer(item._id, currentPlayersSafe.player2Id!, player2DisplayName, item.tableNumber)}
                    >
                        <Text style={styles.removePlayerButtonText}>Remove</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>

        <View style={styles.queueInfo}>
          <Text style={styles.queueText}>
            Queue: {item.queue.length} people
          </Text>
          {isCurrentUserInQueue && queuePosition && (
            <Text style={styles.queuePositionText}>
              Your position: {queuePosition}
            </Text>
          )}

          {item.queue.length > 0 && (
            <View style={styles.queueListContainer}>
              <Text style={styles.queueListTitle}>Current Queue:</Text>
              {item.queue.map((userInQueue, index) => (
                <Text key={userInQueue._id || `queue-item-${index}`} style={styles.queueListItem}> {/* Added fallback key */}
                  {index + 1}. {userInQueue.displayName || 'Unnamed User'} {String(userInQueue._id) === String(currentUserUid) ? '(You)' : ''}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.tableButtonContainer}>
            <TouchableOpacity
                style={[styles.queueButton, { backgroundColor: primaryButtonColor }]}
                onPress={primaryButtonAction}
            >
                <Text style={styles.queueButtonText}>{primaryButtonText}</Text>
            </TouchableOpacity>

            {/* Admin Clear Queue Button */}
            {isAdmin && (
                <TouchableOpacity
                    style={[styles.queueButton, styles.clearQueueButton]}
                    onPress={() => handleClearQueue(item)}
                >
                    <Text style={styles.queueButtonText}>Clear Queue</Text>
                </TouchableOpacity>
            )}
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

      {/* Win Confirmation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={winClaimModalVisible}
        onRequestClose={() => setWinClaimModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Win Claimed!</Text>
            {claimedWinDetails && (
              <Text style={styles.modalText}>
                {claimedWinDetails.winnerDisplayName} claims victory on Table {claimedWinDetails.tableNumber}.
                Do you confirm this win?
              </Text>
            )}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmWin}
              >
                <Text style={styles.modalButtonText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDecline]}
                onPress={handleDeclineWin}
              >
                <Text style={styles.modalButtonText}>Dispute</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  // Styles for players info
  playersInfo: {
    marginTop: 5,
    marginBottom: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#e8f5e9', // Light green background for player info
    borderRadius: 5,
  },
  playerLine: { // New style for player and button alignment
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  playerText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2e7d32', // Darker green
    // No marginBottom here, as playerLine handles spacing
  },
  removePlayerButton: { // Style for the new remove player button
    backgroundColor: '#ff4d4f', // Red for removal
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    marginLeft: 10,
  },
  removePlayerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
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
  joinQueueButton: { // This style is now dynamic via primaryButtonColor
    backgroundColor: '#17a2b8', // Teal
  },
  leaveQueueButton: { // This style is now dynamic via primaryButtonColor
    backgroundColor: '#dc3545', // Red
  },
  clearQueueButton: {
    backgroundColor: '#ffc107',
    marginLeft: 5,
  },
  queueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal Styles
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  modalButton: {
    borderRadius: 10,
    padding: 12,
    elevation: 2,
    minWidth: 100,
    marginHorizontal: 5,
  },
  modalButtonConfirm: {
    backgroundColor: '#28a745', // Green
  },
  modalButtonDecline: {
    backgroundColor: '#dc3545', // Red
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
});

export default VenueDetailScreen;
