import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import auth from '@react-native-firebase/auth'; // Import firebase auth

// Import the RootStackParamList type from App.tsx
import { RootStackParamList } from '../App';

// Define the props for PayForTableScreen
type PayForTableScreenProps = StackScreenProps<RootStackParamList, 'PayForTable'>;

// Backend base URL (must match the one in App.tsx)
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

const PayForTableScreen = ({ route, navigation }: PayForTableScreenProps): JSX.Element => {
  const { tableId, tableNumber, venueId, venueName, perGameCost, esp32DeviceId, currentUserTokenBalance } = route.params;

  const [loading, setLoading] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(user => {
      if (user) {
        setCurrentUserUid(user.uid);
      } else {
        setCurrentUserUid(null);
      }
    });
    return unsubscribe;
  }, []);

  // Function to send authenticated requests to the backend
  const sendAuthenticatedRequest = useCallback(async (path: string, method: string = 'POST', body?: any) => {
    if (!currentUserUid) {
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
  }, [currentUserUid]);

  const handlePayWithTokens = async () => {
    if (!currentUserUid) {
      Alert.alert('Authentication Required', 'Please sign in to make a payment.');
      return;
    }

    // Ensure perGameCost is a valid number before comparing
    if (typeof perGameCost !== 'number' || isNaN(perGameCost) || perGameCost <= 0) {
        Alert.alert('Error', 'Invalid table cost. Please try again later.');
        return;
    }

    if (currentUserTokenBalance < perGameCost) {
      Alert.alert(
        'Insufficient Tokens',
        `You need ${perGameCost} tokens to pay for this table, but you only have ${currentUserTokenBalance}. Please purchase more tokens.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => navigation.navigate('TokenScreen', { uid: currentUserUid, tokenBalance: currentUserTokenBalance }) }
        ]
      );
      return;
    }

    setLoading(true);
    try {
      // MODIFIED: Send perGameCost in the request body
      const response = await sendAuthenticatedRequest(`/tables/${tableId}/pay-with-tokens`, 'POST', {
        cost: perGameCost, // Send the perGameCost
      });

      Alert.alert('Success', response.message || 'Tokens deducted successfully!');
      navigation.goBack(); // Go back to VenueDetailScreen
    } catch (error: any) {
      console.error('Error paying with tokens:', error);
      Alert.alert('Payment Failed', `Could not deduct tokens: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Pay for Table</Text>
        <Text style={styles.detailText}>Venue: {venueName}</Text>
        <Text style={styles.detailText}>Table: {tableNumber}</Text>
        {esp32DeviceId && <Text style={styles.detailText}>Device ID: {esp32DeviceId}</Text>}
        {/* MODIFIED: Ensure perGameCost is displayed */}
        <Text style={styles.costText}>Cost: {typeof perGameCost === 'number' ? perGameCost : 'N/A'} tokens</Text>
        <Text style={styles.balanceText}>Your Balance: {currentUserTokenBalance} tokens</Text>

        <TouchableOpacity
          style={[styles.payButton, currentUserTokenBalance < perGameCost && styles.disabledButton]}
          onPress={handlePayWithTokens}
          disabled={loading || !currentUserUid || currentUserTokenBalance < perGameCost || typeof perGameCost !== 'number' || isNaN(perGameCost) || perGameCost <= 0}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payButtonText}>Pay {typeof perGameCost === 'number' ? perGameCost : 'N/A'} Tokens</Text>
          )}
        </TouchableOpacity>

        {currentUserTokenBalance < perGameCost && (
          <TouchableOpacity
            style={styles.buyTokensButton}
            onPress={() => navigation.navigate('TokenScreen', { uid: currentUserUid!, tokenBalance: currentUserTokenBalance })}
            disabled={loading}
          >
            <Text style={styles.buyTokensButtonText}>Buy More Tokens</Text>
          </TouchableOpacity>
        )}

        {!currentUserUid && (
          <Text style={styles.authWarning}>Please sign in to make payments.</Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    width: '90%',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  detailText: {
    fontSize: 18,
    color: '#555',
    marginBottom: 10,
    textAlign: 'center',
  },
  costText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#007bff',
    marginTop: 15,
    marginBottom: 10, // Adjusted margin
  },
  balanceText: { // NEW: Style for displaying current token balance
    fontSize: 18,
    fontWeight: '600',
    color: '#28a745', // Green for balance
    marginBottom: 30,
  },
  payButton: {
    backgroundColor: '#6f42c1', // Purple
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10, // Added margin
  },
  disabledButton: { // NEW: Style for disabled button
    backgroundColor: '#cccccc',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buyTokensButton: { // NEW: Style for "Buy More Tokens" button
    backgroundColor: '#007bff', // Blue
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyTokensButtonText: { // NEW: Style for "Buy More Tokens" button text
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  authWarning: {
    marginTop: 20,
    fontSize: 14,
    color: 'red',
    textAlign: 'center',
  },
});

export default PayForTableScreen;
