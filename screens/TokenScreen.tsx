import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types'; // Import RootStackParamList from types.ts
import auth from '@react-native-firebase/auth'; // Import Firebase auth

// Define the props for TokenScreen
// The 'TokenScreen' in RootStackParamList now expects a 'user' object
type TokenScreenProps = StackScreenProps<RootStackParamList, 'TokenScreen'>;

// Backend base URL (should be the same as in App.tsx)
const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

const TokenScreen: React.FC<TokenScreenProps> = ({ route }) => {
  // Destructure uid and tokenBalance from route.params.user
  const { user: { uid, tokenBalance } } = route.params; // Access nested user object

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [loading, setLoading] = useState(false);
  // Initialize currentTokens with the value from route.params
  const [currentTokens, setCurrentTokens] = useState<number>(tokenBalance);

  // Debugging log for initial render
  console.log(`[TokenScreen] Initial render. route.params.user.tokenBalance: ${tokenBalance}, currentTokens state: ${currentTokens}`);

  // Use an effect to update currentTokens if the prop changes (e.g., after a successful purchase
  // and App.tsx updates its state, which then re-renders TokenScreen with new route.params)
  useEffect(() => {
    console.log(`[TokenScreen] useEffect triggered. Prop tokenBalance: ${tokenBalance}. Updating currentTokens state.`);
    setCurrentTokens(tokenBalance);
  }, [tokenBalance]);


  // Function to fetch a new payment intent from your backend
  const fetchPaymentSheetParams = useCallback(async (amountTokens: number) => {
    try {
      setLoading(true);
      const currentUser = auth().currentUser;
      if (!currentUser) {
        console.error('[TokenScreen:fetchPaymentSheetParams] currentUser is null. Cannot fetch ID token.');
        Alert.alert('Authentication Error', 'You are not logged in. Please sign in to make a purchase.');
        setLoading(false);
        return null;
      }
      const idToken = await currentUser.getIdToken(true); // Force refresh token
      console.log(`[TokenScreen:fetchPaymentSheetParams] Fetched ID Token (first 20 chars): ${idToken ? idToken.substring(0, 20) + '...' : 'null'}`);

      const url = `${BACKEND_BASE_URL}/api/payments/create-token-payment-intent`;
      console.log('[TokenScreen:fetchPaymentSheetParams] Requesting payment intent from URL:', url);
      console.log('[TokenScreen:fetchPaymentSheetParams] Requesting with Authorization Header:', `Bearer ${idToken ? idToken.substring(0, 20) + '...' : 'null'}`);
      console.log('[TokenScreen:fetchPaymentSheetParams] Request Body:', JSON.stringify({ amountTokens: amountTokens, userId: uid }));


      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amountTokens: amountTokens,
          userId: uid,
        }),
      });

      const textResponse = await response.text(); // Read response as text first
      console.log('[TokenScreen:fetchPaymentSheetParams] Raw backend response:', textResponse);

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = JSON.parse(textResponse);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If parsing fails, it's likely not JSON, use raw text or a generic message
          errorMessage = `Server responded with non-JSON error: ${textResponse.substring(0, 200)}...`;
        }
        console.error(`[TokenScreen:fetchPaymentSheetParams] Failed to fetch payment intent: ${errorMessage}`);
        Alert.alert('Error', `Failed to prepare payment: ${errorMessage}`);
        return null;
      }

      const { paymentIntent, ephemeralKey, customer, publishableKey } = JSON.parse(textResponse); // Parse only if response is OK

      return {
        paymentIntent,
        ephemeralKey,
        customer,
        publishableKey,
      };
    } catch (error: any) {
      console.error('[TokenScreen:fetchPaymentSheetParams] Unexpected error fetching payment sheet params:', error);
      Alert.alert('Error', `Failed to prepare payment: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // Function to initialize and present the payment sheet
  const buyTokens = useCallback(async (amountTokens: number) => {
    setLoading(true);

    const paymentSheetParams = await fetchPaymentSheetParams(amountTokens);

    if (!paymentSheetParams) {
      setLoading(false);
      return;
    }

    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: 'Billiards Hub',
      customerId: paymentSheetParams.customer,
      customerEphemeralKeySecret: paymentSheetParams.ephemeralKey,
      paymentIntentClientSecret: paymentSheetParams.paymentIntent,
      allowsDelayedPaymentMethods: true,
      style: 'alwaysLight',
      returnURL: 'your-app-url-scheme://stripe-redirect', // IMPORTANT: Configure this in your app.json and Stripe dashboard
      customFlow: 'automatic',
    });

    if (initError) {
      console.error('Error initializing payment sheet:', initError);
      Alert.alert('Error', `Failed to initialize payment: ${initError.message}`);
      setLoading(false);
      return;
    }

    const { error: presentError, paymentOption } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        Alert.alert('Payment Cancelled', 'You cancelled the payment.');
      } else {
        Alert.alert('Payment Error', `Payment failed: ${presentError.message}`);
      }
      console.error('Error presenting payment sheet:', presentError);
    } else {
      Alert.alert('Success', `Payment successful! Your tokens will be updated shortly.`);
      // After successful payment, call your backend to confirm the purchase and update tokens
      try {
        const currentUser = auth().currentUser;
        if (!currentUser) {
          console.error('User not logged in after successful payment, cannot confirm tokens.');
          return;
        }
        const idToken = await currentUser.getIdToken(true);

        const confirmResponse = await fetch(`${BACKEND_BASE_URL}/api/payments/confirm-token-purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            paymentIntentId: paymentSheetParams.paymentIntent.split('_secret_')[0], // Extract PI ID from client_secret
            amountTokens: amountTokens,
          }),
        });

        const confirmTextResponse = await confirmResponse.text(); // Read as text first
        console.log('[TokenScreen:buyTokens] Raw backend confirm response:', confirmTextResponse);

        if (!confirmResponse.ok) {
          let errorMessage = `HTTP error! status: ${confirmResponse.status}`;
          try {
            const errorData = JSON.parse(confirmTextResponse);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `Server responded with non-JSON error: ${confirmTextResponse.substring(0, 200)}...`;
          }
          throw new Error(errorMessage);
        }

        const confirmData = JSON.parse(confirmTextResponse);
        console.log(`[TokenScreen:buyTokens] Backend confirmed purchase. New balance from backend: ${confirmData.newBalance}`);
        Alert.alert('Success', `Tokens loaded successfully! New balance: ${confirmData.newBalance}`);

      } catch (confirmError: any) {
        console.error('Error confirming token purchase with backend:', confirmError);
        Alert.alert('Error', `Tokens purchased but failed to update balance: ${confirmError.message}. Please contact support.`);
      }
    }
    setLoading(false);
  }, [initPaymentSheet, presentPaymentSheet, fetchPaymentSheetParams, uid]);


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.title}>Your Tokens</Text>
        {/* Display currentTokens state */}
        <Text style={styles.tokenCount}>You have {currentTokens} Tokens</Text>

        <View style={styles.optionsContainer}>
          <Text style={styles.sectionTitle}>Buy More Tokens:</Text>
          <TouchableOpacity
            style={styles.buyButton}
            onPress={() => buyTokens(10)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Buy 10 Tokens ($1.00)</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buyButton}
            onPress={() => buyTokens(20)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Buy 20 Tokens ($2.00)</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buyButton}
            onPress={() => buyTokens(50)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Buy 50 Tokens ($5.00)</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buyButton}
            onPress={() => buyTokens(100)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Buy 100 Tokens ($10.00)</Text>}
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.loadingText}>Processing payment...</Text>
          </View>
        )}
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  tokenCount: {
    fontSize: 22,
    fontWeight: '600',
    color: '#007bff',
    marginBottom: 30,
  },
  optionsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#555',
  },
  buyButton: {
    backgroundColor: '#28a745', // Green button
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginBottom: 15,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure it's above other content
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
});

export default TokenScreen;
