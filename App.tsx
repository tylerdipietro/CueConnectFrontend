// App.js
// This is the main entry point of your React Native application.
// It sets up the Firebase app, authentication listener, and provides
// the user context to the rest of the application.

import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin'; // For configuration only
import auth from '@react-native-firebase/auth'; // For configuration check only

import { StripeProvider } from '@stripe/stripe-react-native';

// Import modular authentication service and user context
import {
  UserProvider,
} from './src/services/AuthService'; // Assuming src/services/AuthService.js
import { firebaseConfig } from './src/config/firebaseConfig'; // Assuming src/config/firebaseConfig.js
import AppContent from './src/AppContent'; // Your main app logic extracted to AppContent.js
import AuthScreen from './src/screens/AuthScreen'; // Your dedicated authentication screen

/**
 * Main App Component
 * Manages the global authentication state and renders either the
 * authentication screen or the home screen based on user login status.
 */
const App = () => {
  // `initializing` state helps handle the initial Firebase auth check
  const [initializing, setInitializing] = useState(true);
  // `user` state holds the current authenticated user object from Firebase
  // This state is local to App.js to decide between AuthScreen and AppContent
  const [user, setUser] = useState(null);

  // Set up the Google Sign-In configuration (for Web and Android client IDs)
  // This needs to be done once at the app's root level.
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: firebaseConfig.webClientId,
      iosClientId: firebaseConfig.iosClientId,
      scopes: ['email', 'profile'], // Request email and profile data
      offlineAccess: true, // Request a refresh token (optional, but good for long-lived sessions)
    });
    console.log('[App.js] Google Sign-In configured.');

    // Also, attach the Firebase auth state listener here.
    // This listener will update the local 'user' state to control root-level navigation.
    const subscriber = auth().onAuthStateChanged(firebaseUser => {
      setUser(firebaseUser);
      if (initializing) {
        setInitializing(false);
      }
      console.log('[App.js] Auth state changed. User:', firebaseUser ? firebaseUser.uid : 'null');
    });
    // Unsubscribe from the listener when the component unmounts
    return subscriber;
  }, [initializing]); // Only run on first mount, 'initializing' acts as a flag

  // Show a loading indicator while Firebase is initializing or user state is being checked
  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading CueConnect...</Text>
      </View>
    );
  }

  // Render the appropriate screen based on user authentication status
  return (
    // Wrap your entire app with StripeProvider
    // Replace 'pk_test_YOUR_ACTUAL_PUBLISHABLE_KEY' with your actual Stripe Publishable Key.
    // This key is a public key and can be hardcoded.
    <StripeProvider
      publishableKey="pk_test_51RauBOQXbI6EW0XUi1DeT8vKI3fS8Z7hGJyQs5jTjFlSdAWqbkQNOo54QMMYycw83lcrHMWnggZPvix5FNb0BeRk00Lu1rexTy" // Corrected placeholder
      merchantIdentifier="merchant.com.tylerdipietro.cueconnect" // Your merchant ID
      urlScheme="cueconnect" // Your URL scheme
    >
      <UserProvider>
        {user ? <AppContent /> : <AuthScreen />}
      </UserProvider>
    </StripeProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});

export default App;
