import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Alert, Button, SafeAreaView, TouchableOpacity, Modal } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import io from 'socket.io-client';

// Import the RootStackParamList and User types from App.tsx
import { RootStackParamList, User } from '../App';

type VenueDetailScreenProps = StackScreenProps<RootStackParamList, 'VenueDetail'>;

// Backend base URL (must match the one in App.tsx)
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';
const SOCKET_IO_URL = BACKEND_BASE_URL;

// Define a simplified User type for populated queue items
interface QueueUser {
  displayName: string;
  _id: string; // Firebase UID from backend, needed for consistency and comparison
}

interface CurrentPlayers {
  player1Id: string | null;
  player2Id: string | null;
  // Removed player1DisplayName and player2DisplayName from here
  // as they are now expected at the root of the Table object via playerDetails
}

interface PlayerDetails {
  _id: string;
  displayName: string;
}

interface Table {
  _id: string;
  venueId: string; // This should be the venue ID string
  tableNumber: string | number;
  esp32DeviceId?: string;
  status: 'available' | 'occupied' | 'queued' | 'in_play' | 'awaiting_confirmation' | 'maintenance' | 'out_of_order';
  currentPlayers: CurrentPlayers;
  currentSessionId?: string;
  queue: QueueUser[];
  perGameCost: number;
  player1Details?: PlayerDetails; // Added for populated player data
  player2Details?: PlayerDetails; // Added for populated player data
}

const VenueDetailScreen = ({ route }: VenueDetailScreenProps): JSX.Element => {
  const { venueId, venueName } = route.params;
  const navigation = useNavigation<StackScreenProps<RootStackParamList, 'VenueDetail'>['navigation']>();
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [userAuthUid, setUserAuthUid] = useState<string | null>(null);
  const [userAuthDisplayName, setUserAuthDisplayName] = useState<string>('You');
  const [currentUserTokenBalance, setCurrentUserTokenBalance] = useState<number>(0);

  const [winClaimModalVisible, setWinClaimModalVisible] = useState(false);
  const [claimedWinDetails, setClaimedWinDetails] = useState<{
    tableId: string;
    tableNumber: string | number;
    winnerId: string;
    winnerDisplayName: string;
    message: string; // Added message to winClaimedDetails
  } | null>(null);

  const socketRef = useRef<any | null>(null);

  // Effect for Firebase Auth state and user profile fetch
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(async user => {
      if (user) {
        setUserAuthUid(user.uid);
        setUserAuthDisplayName(user.displayName || user.email || 'You');

        try {
          const idToken = await user.getIdToken(true);
          const response = await fetch(`${BACKEND_BASE_URL}/api/user/profile`, {
            headers: { 'Authorization': `Bearer ${idToken}` },
          });
          if (response.ok) {
            const profileData = await response.json();
            setIsAdmin(profileData.isAdmin || false);
            setCurrentUserTokenBalance(profileData.tokenBalance ?? 0);
          } else {
            console.warn('[VenueDetailScreen-Auth] Failed to fetch user profile for admin/token check:', response.status);
            setIsAdmin(false);
            setCurrentUserTokenBalance(0);
          }
        } catch (error) {
          console.error('[VenueDetailScreen-Auth] Error fetching user profile:', error);
          setIsAdmin(false);
          setCurrentUserTokenBalance(0);
        }
      } else {
        setUserAuthUid(null);
        setUserAuthDisplayName('You');
        setIsAdmin(false);
        setCurrentUserTokenBalance(0);
      }
    });
    return subscriber;
  }, []);

  // Callback to sync user to backend (used by socket connection)
  const syncUserToBackend = useCallback(async () => {
      if (!userAuthUid) {
        console.warn('[VenueDetailScreen-Sync] No userAuthUid to sync.');
        return;
      }

      try {
        const idToken = await auth().currentUser?.getIdToken(true);
        if (!idToken) {
          console.error('[VenueDetailScreen-Sync] No ID token available for backend sync.');
          return;
        }

        const response = await fetch(`${BACKEND_BASE_URL}/api/user/sync`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName: userAuthDisplayName,
          }),
        });
        if (!response.ok) {
          console.error('[VenueDetailScreen-Sync] Error syncing user to backend:', response.status, await response.text());
        } else {
          console.log('[VenueDetailScreen-Sync] User synced to backend successfully.');
        }
      } catch (error) {
        console.error('[VenueDetailScreen-Sync] Network error during user sync:', error);
      }
    }, [userAuthUid, userAuthDisplayName]);

  // Callback to fetch tables (initial load)
  const fetchTablesForVenue = useCallback(async () => {
    setIsLoadingTables(true);
    setErrorMsg(null);
    try {
      if (!userAuthUid) {
        console.warn('[VenueDetailScreen-Fetch] Skipping initial table fetch: userAuthUid is null.');
        setIsLoadingTables(false);
        return;
      }
      const idToken = await auth().currentUser?.getIdToken(true);
      if (!idToken) {
        throw new Error('Failed to get authentication token for fetching tables.');
      }

      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${venueId}/tables-detailed`, {
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
        } catch (e) { /* not JSON */ }
        throw new Error(errorMessage);
      }

      const data: Table[] = await response.json();
      console.log('[VenueDetailScreen-Fetch] Raw data received from tables-detailed (initial fetch):', JSON.stringify(data, null, 2));
      if (data.length > 0) {
        console.log(`[VenueDetailScreen-Fetch] First table's perGameCost from initial fetch: ${data[0].perGameCost}, Type: ${typeof data[0].perGameCost}`);
      }
      setTables(data);
      console.log(`[VenueDetailScreen-Fetch] Tables fetched for venue ${venueName}.`);
    } catch (error: any) {
      console.error('[VenueDetailScreen-Fetch] Fetch Tables Error:', error);
      setErrorMsg(`Failed to fetch tables: ${error.message || 'Network error'}.`);
      setTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  }, [venueId, userAuthUid, venueName]);

  // Function to attach all Socket.IO listeners (memoized with useCallback)
  const attachSocketListeners = useCallback((socket: any) => {
    console.log('[VenueDetailScreen-Socket-Listeners] Attaching all Socket.IO listeners.');

    // Generic listener for ALL events - VERY USEFUL FOR DEBUGGING
    socket.onAny((eventName: string, ...args: any[]) => {
      console.log(`[VenueDetailScreen-Socket-ANY] Received event: ${eventName}`, JSON.stringify(args, null, 2));
    });

    socket.on('initialVenueState', (data: Table[]) => {
      console.log('[VenueDetailScreen-Socket-Listeners] Received initialVenueState via socket.');
      console.log('[VenueDetailScreen-Socket-Listeners] Raw initialVenueState data (socket):', JSON.stringify(data, null, 2));
      if (data.length > 0) {
        console.log(`[VenueDetailScreen-Socket-Listeners] First table's perGameCost from initialVenueState (socket): ${data[0].perGameCost}, Type: ${typeof data[0].perGameCost}`);
      }
      setTables(data);
      console.log('[VenueDetailScreen-Socket-Listeners] Tables state updated from initialVenueState.');
    });

    socket.on('queueUpdate', (updatedTable: Table) => {
      console.log(`[VenueDetailScreen-Socket-Listeners] >>> RECEIVED queueUpdate for table ${updatedTable._id}.`);
      console.log('[VenueDetailScreen-Socket-Listeners] Raw received queueUpdate data:', JSON.stringify(updatedTable, null, 2));
      console.log(`[VenueDetailScreen-Socket-Listeners] queueUpdate table perGameCost: ${updatedTable.perGameCost}, Type: ${typeof updatedTable.perGameCost}`);

      setTables(prevTables => {
        const newTables = prevTables.map(table =>
          table._id === updatedTable._id
            ? updatedTable
            : table
        );
        console.log('[VenueDetailScreen-Socket-Listeners] Tables state AFTER queueUpdate:', JSON.stringify(newTables, null, 2));
        return newTables;
      });
    });

    socket.on('tableStatusUpdate', (updatedTable: Table) => {
      console.log(`[VenueDetailScreen-Socket-Listeners] >>> RECEIVED tableStatusUpdate for table ${updatedTable._id}.`);
      console.log('[VenueDetailScreen-Socket-Listeners] Raw received tableStatusUpdate data:', JSON.stringify(updatedTable, null, 2));
      console.log(`[VenueDetailScreen-Socket-Listeners] tableStatusUpdate table perGameCost: ${updatedTable.perGameCost}, Type: ${typeof updatedTable.perGameCost}`);

      setTables(prevTables => {
        const newTables = prevTables.map(table =>
          table._id === updatedTable._id ? updatedTable : table
        );
        console.log('[VenueDetailScreen-Socket-Listeners] Tables state AFTER tableStatusUpdate:', JSON.stringify(newTables, null, 2));
        return newTables;
      });
    });

    // Modified to receive the full data from backend, now emitted to winner directly
    socket.on('winClaimedNotification', (data: {
      tableId: string;
      tableNumber: string | number;
      winnerId: string;
      winnerDisplayName: string;
      message: string; // Added message field
    }) => {
      console.log('[VenueDetailScreen-Socket-Listeners] Received winClaimedNotification.');
      // Alert.alert('Win Claimed!', data.message); // This alert can be redundant if modal shows
      setClaimedWinDetails(data);
      setWinClaimModalVisible(true);
    });

    socket.on('winClaimSent', (data: { tableId: string; tableNumber: string | number; message: string; }) => {
      console.log('[VenueDetailScreen-Socket-Listeners] Received winClaimSent.');
      Alert.alert('Win Claim Sent', data.message);
    });

    socket.on('winConfirmed', (data: { tableId: string; tableNumber: string | number; message: string; }) => {
      console.log('[VenueDetailScreen-Socket-Listeners] Received winConfirmed.');
      Alert.alert('Win Confirmed', data.message);
    });

    socket.on('gameEnded', (data: { tableId: string; tableNumber: string | number; message: string; }) => {
      console.log('[VenueDetailScreen-Socket-Listeners] Received gameEnded.');
      Alert.alert('Game Over', data.message);
    });

    socket.on('tableJoined', (data: { tableId: string; tableNumber: string | number; message: string; playerSlot: string; }) => {
      console.log('[VenueDetailScreen-Socket-Listeners] Received tableJoined.');
      Alert.alert('Table Joined', data.message);
    });

    socket.on('tokenBalanceUpdate', (data: { newBalance: number }) => {
      console.log(`[VenueDetailScreen-Socket-Listeners] Received tokenBalanceUpdate event: ${data.newBalance}.`);
      setCurrentUserTokenBalance(data.newBalance);
    });

    socket.on('disconnect', (reason: string) => {
      console.log(`[VenueDetailScreen-Socket-Listeners] Socket disconnected: ${socket.id}, Reason: ${reason}`);
    });

    socket.on('connect_error', (err: Error) => {
      console.error(`[VenueDetailScreen-Socket-Listeners] Socket Connection Error: ${err.message}`);
    });

  }, []); // Empty dependency array for attachSocketListeners, as it only defines the listeners

  // Effect for Socket.IO connection and management
  useEffect(() => {
    if (!userAuthUid) {
      console.log('[VenueDetailScreen-Socket-Main] User UID not available, skipping socket connection setup.');
      if (socketRef.current) {
        socketRef.current.emit('leaveVenueRoom', venueId);
        socketRef.current.disconnect();
        socketRef.current = null;
        console.log('[VenueDetailScreen-Socket-Main] Disconnected existing socket due to missing userAuthUid.');
      }
      return;
    }

    // Ensure only one socket connection is active
    if (socketRef.current && socketRef.current.connected) {
      console.log('[VenueDetailScreen-Socket-Main] Existing socket found and connected, disconnecting for fresh setup.');
      socketRef.current.emit('leaveVenueRoom', venueId);
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log('[VenueDetailScreen-Socket-Main] Attempting to establish new socket connection...');
    const socket = io(SOCKET_IO_URL, {
      transports: ['websocket'],
      query: { userId: userAuthUid }
    });
    socketRef.current = socket;

    attachSocketListeners(socket); // Attach all listeners here

    socket.on('connect', async () => {
      console.log(`[VenueDetailScreen-Socket-Main] Connected to backend server. Socket ID: ${socket.id}. Socket.connected: ${socket.connected}`);
      await syncUserToBackend();
      socket.emit('registerForUpdates', userAuthUid);
      console.log(`[VenueDetailScreen-Socket-Main] Emitted registerForUpdates for user ${userAuthUid}.`);
      
      console.log(`[VenueDetailScreen-Socket-Main] Attempting to join venue room: ${venueId}.`);
      socket.emit('joinVenueRoom', venueId);
      console.log(`[VenueDetailScreen-Socket-Main] Emitted joinVenueRoom for venue ${venueId}.`);
    });

    socket.on('reconnect', (attemptNumber: number) => {
      console.log(`[VenueDetailScreen-Socket-Main] Reconnected to backend server on attempt ${attemptNumber}.`);
      // Re-attach listeners on reconnect to be absolutely sure
      attachSocketListeners(socket); 
      socket.emit('joinVenueRoom', venueId);
      socket.emit('registerForUpdates', userAuthUid);
      console.log(`[VenueDetailScreen-Socket-Main] Re-emitted joinVenueRoom and registerForUpdates on reconnect.`);
    });

    // Cleanup function: Disconnect socket and remove listeners on component unmount or dependency change
    return () => {
      if (socketRef.current) {
        console.log('[VenueDetailScreen-Socket-Main] Running cleanup for socket connection.');
        socketRef.current.emit('leaveVenueRoom', venueId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [venueId, userAuthUid, syncUserToBackend, attachSocketListeners]);

  // Effect to trigger initial table fetch once userAuthUid is available
  useEffect(() => {
    if (userAuthUid) {
      fetchTablesForVenue();
    }
  }, [fetchTablesForVenue, userAuthUid]);


  const sendAuthenticatedRequest = useCallback(async (path: string, method: string = 'POST', body?: any) => {
    if (!userAuthUid) {
      throw new Error('User not authenticated.');
    }
    const idToken = await auth().currentUser?.getIdToken(true);
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
      const errorData = await response.json().catch(() => ({ message: response.statusText || 'Unknown error' }));
      throw new Error(errorData.message || `HTTP Error: ${response.status}`);
    }

    return response.json();
  }, [userAuthUid]);

  const handleJoinTable = async (table: Table) => {
    try {
      console.log(`[VenueDetailScreen-Action] Attempting to join table ${table.tableNumber}.`);
      await sendAuthenticatedRequest(`/tables/${table._id}/join-table`);
    } catch (error: any) {
      console.error('Error joining table:', error);
      Alert.alert('Error', `Failed to join table: ${error.message}`);
    }
  };

  const handleJoinQueue = async (table: Table) => {
    try {
      console.log(`[VenueDetailScreen-Action] Attempting to join queue for table ${table.tableNumber}.`);
      await sendAuthenticatedRequest(`/tables/${table._id}/join-queue`);
    } catch (error: any) {
      console.error('Error joining queue:', error);
      Alert.alert('Error', `Failed to join queue: ${error.message}`);
    }
  };

  const handleLeaveQueue = async (table: Table) => {
    try {
      console.log(`[VenueDetailScreen-Action] Attempting to leave queue for table ${table.tableNumber}.`);
      await sendAuthenticatedRequest(`/tables/${table._id}/leave-queue`);
    } catch (error: any) {
      console.error('Error leaving queue:', error);
      Alert.alert('Error', `Failed to leave queue: ${error.message}`);
    }
  };

  const handlePayForTable = (table: Table) => {
    console.log(`[VenueDetailScreen-Action] handlePayForTable: table.perGameCost = ${table.perGameCost}, Type: ${typeof table.perGameCost}`);

    if (typeof table.perGameCost !== 'number' || isNaN(table.perGameCost) || table.perGameCost < 0) {
        Alert.alert('Error', 'Table cost information is missing or invalid.');
        return;
    }
    navigation.navigate('PayForTable', {
      tableId: table._id,
      tableNumber: table.tableNumber,
      venueId: table.venueId,
      venueName: venueName,
      perGameCost: table.perGameCost,
      esp32DeviceId: table.esp32DeviceId,
      currentUserTokenBalance: currentUserTokenBalance,
    });
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
              console.log(`[VenueDetailScreen-Action] Attempting to clear queue for table ${table.tableNumber}.`);
              await sendAuthenticatedRequest(`/tables/${table._id}/clear-queue`);
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

  const handleClaimWin = async (table: Table) => {
    if (!userAuthUid) return;

    const isPlayer = table.currentPlayers.player1Id === userAuthUid || table.currentPlayers.player2Id === userAuthUid;
    if (!isPlayer) {
      Alert.alert('Error', 'You must be an active player to claim a win.');
      return;
    }

    Alert.alert(
      "Claim Victory",
      `Are you sure you won the game on Table ${table.tableNumber}? This will notify your opponent for confirmation.`,
      [
        { text: "Cancel", "style": "cancel" },
        {
          text: "Claim Win",
          onPress: async () => {
            try {
              console.log(`[VenueDetailScreen-Action] Attempting to claim win for table ${table.tableNumber}.`);
              await sendAuthenticatedRequest(`/tables/${table._id}/claim-win`, 'POST', {});
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

  const handleConfirmWin = async () => {
    if (!claimedWinDetails || !userAuthUid) return;

    try {
      console.log(`[VenueDetailScreen-Action] Attempting to confirm win for table ${claimedWinDetails.tableNumber}.`);
      await sendAuthenticatedRequest(`/tables/${claimedWinDetails.tableId}/confirm-win`, 'POST', {
        winnerId: claimedWinDetails.winnerId,
      });
      setWinClaimModalVisible(false);
      setClaimedWinDetails(null);
    } catch (error: any) {
      console.error('Error confirming win:', error);
      Alert.alert('Error', `Failed to confirm win: ${error.message}`);
    }
  };

  const handleDeclineWin = () => {
    Alert.alert('Win Disputed', 'You have disputed the win. (Functionality not fully implemented)');
    setWinClaimModalVisible(false);
    setClaimedWinDetails(null);
  };

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
              console.log(`[VenueDetailScreen-Action] Attempting to remove player ${playerName} from table ${tableNumber}.`);
              await sendAuthenticatedRequest(`/tables/${tableId}/remove-player`, 'POST', {
                playerIdToRemove: playerId,
              });
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
    console.log(`[VenueDetailScreen-RenderItem] Table ${item.tableNumber} perGameCost: ${item.perGameCost}, Type: ${typeof item.perGameCost}`);
    // console.log(`[VenueDetailScreen-RenderItem] Table ${item.tableNumber} full item:`, JSON.stringify(item, null, 2)); // Debug full item

    const currentPlayersSafe = item.currentPlayers || { player1Id: null, player2Id: null } as CurrentPlayers;

    const numPlayers = (currentPlayersSafe.player1Id ? 1 : 0) + (currentPlayersSafe.player2Id ? 1 : 0);
    const isCurrentUserPlaying = currentPlayersSafe.player1Id === userAuthUid || currentPlayersSafe.player2Id === userAuthUid;
    const isCurrentUserInQueue = item.queue.some(userInQueue => String(userInQueue._id) === String(userAuthUid));

    let primaryButtonText = '';
    let primaryButtonAction: () => void = () => {};
    let primaryButtonColor = '#007bff';

    if (isCurrentUserPlaying) {
        primaryButtonText = 'I WON';
        primaryButtonAction = () => handleClaimWin(item);
        primaryButtonColor = '#28a745';
    } else if (item.queue.length === 0) {
        const canJoinTableDirectly = (numPlayers === 0 && item.status === 'available') ||
                                     (numPlayers === 1 && (item.status === 'available' || item.status === 'in_play'));

        if (canJoinTableDirectly) {
            primaryButtonText = 'Join Table';
            primaryButtonAction = () => handleJoinTable(item);
            primaryButtonColor = '#007bff';
        } else {
            primaryButtonText = 'N/A';
            primaryButtonAction = () => Alert.alert('Info', 'This action is not available for this table at the moment.');
            primaryButtonColor = '#6c757d';
        }
    } else if (isCurrentUserInQueue) {
        primaryButtonText = 'Leave Queue';
        primaryButtonAction = () => handleLeaveQueue(item);
        primaryButtonColor = '#dc3545';
    } else {
        primaryButtonText = 'Join Queue';
        primaryButtonAction = () => handleJoinQueue(item);
        primaryButtonColor = '#17a2b8';
    }

    const queuePosition = isCurrentUserInQueue ? item.queue.findIndex(userInQueue => String(userInQueue._id) === String(userAuthUid)) + 1 : null;

    // CRITICAL FIX: Access displayName from player1Details/player2Details directly
    const player1DisplayName = item.player1Details?.displayName ? (item.player1Details._id === userAuthUid ? `${userAuthDisplayName} (You)` : item.player1Details.displayName) : 'Empty';
    const player2DisplayName = item.player2Details?.displayName ? (item.player2Details._id === userAuthUid ? `${userAuthDisplayName} (You)` : item.player2Details.displayName) : 'Empty';

    return (
      <View style={styles.tableItem}>
        <Text style={styles.tableNumber}>Table {item.tableNumber}</Text>
        <Text style={styles.tableStatus}>Status: {item.status.toUpperCase()}</Text>
        {item.esp32DeviceId && <Text style={styles.tableDetail}>Device ID: {item.esp32DeviceId}</Text>}
        <Text style={styles.tableDetail}>Cost per game: {typeof item.perGameCost === 'number' ? item.perGameCost : 'N/A'} tokens</Text>

        <View style={styles.playersInfo}>
            <View style={styles.playerLine}>
                <Text style={styles.playerText}>Player 1: {player1DisplayName}</Text>
                {isAdmin && item.currentPlayers.player1Id && ( // Use item.currentPlayers.player1Id for removal logic
                    <TouchableOpacity
                        style={styles.removePlayerButton}
                        onPress={() => handleRemovePlayer(item._id, item.currentPlayers.player1Id!, player1DisplayName, item.tableNumber)}
                    >
                        <Text style={styles.removePlayerButtonText}>Remove</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.playerLine}>
                <Text style={styles.playerText}>Player 2: {player2DisplayName}</Text>
                {isAdmin && item.currentPlayers.player2Id && ( // Use item.currentPlayers.player2Id for removal logic
                    <TouchableOpacity
                        style={styles.removePlayerButton}
                        onPress={() => handleRemovePlayer(item._id, item.currentPlayers.player2Id!, player2DisplayName, item.tableNumber)}
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
                <Text key={userInQueue._id || `queue-item-${index}`} style={styles.queueListItem}>
                  {index + 1}. {userInQueue.displayName || 'Unnamed User'} {String(userInQueue._id) === String(userAuthUid) ? '(You)' : ''}
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

            <TouchableOpacity
                style={[styles.queueButton, styles.payButton]}
                onPress={() => handlePayForTable(item)}
            >
                <Text style={styles.queueButtonText}>Pay for Table</Text>
            </TouchableOpacity>

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
                {/* Use message from claimedWinDetails for the modal body */}
                {claimedWinDetails.message}
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
  playersInfo: {
    marginTop: 5,
    marginBottom: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#e8f5e9',
    borderRadius: 5,
  },
  playerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  playerText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2e7d32',
  },
  removePlayerButton: {
    backgroundColor: '#ff4d4f',
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
    backgroundColor: '#e0f7fa',
    borderRadius: 5,
  },
  queueText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#00796b',
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
    borderTopColor: '#b2ebf2',
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
    marginLeft: 10,
    marginBottom: 2,
  },
  tableButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  queueButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    marginHorizontal: 2,
    marginBottom: 5,
  },
  joinQueueButton: {
    backgroundColor: '#17a2b8',
  },
  leaveQueueButton: {
    backgroundColor: '#dc3545',
  },
  payButton: {
    backgroundColor: '#6f42c1',
  },
  clearQueueButton: {
    backgroundColor: '#ffc107',
    marginLeft: 5,
  },
  queueButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    borderRadius: 10,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonConfirm: {
    backgroundColor: '#28a745',
  },
  modalButtonDecline: {
    backgroundColor: '#dc3545',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
export default VenueDetailScreen;
