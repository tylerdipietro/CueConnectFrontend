// src/screens/AuthScreen.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useUser } from '../services/AuthService'; // Import the useUser hook

/**
 * AuthScreen Component
 * Displays the sign-in UI, specifically the Google Sign-In button.
 * Uses the signInWithGoogle function from AuthService via the useUser hook.
 */
const AuthScreen = () => {
  const { signInWithGoogle } = useUser();

  const handleGoogleSignIn = async () => {
    console.log('[AuthScreen] Google Sign-In button pressed.');
    try {
      await signInWithGoogle();
      // Optionally navigate or show success message here,
      // but App.tsx will handle the navigation based on user state.
    } catch (error) {
      // Error handling is already in AuthService.
      // You can add more specific UI feedback here if needed.
      console.log('[AuthScreen] Google Sign-In failed or cancelled.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to CueConnect!</Text>
      <Text style={styles.subtitle}>Please sign in to continue.</Text>
      <GoogleSigninButton
        style={styles.googleButton}
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Dark}
        onPress={handleGoogleSignIn}
        disabled={false} // Enable/disable button based on app state if needed
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  googleButton: {
    width: 220, // Adjusted width for better visibility
    height: 55, // Adjusted height for better visibility
    marginTop: 30,
    borderRadius: 10, // Added rounded corners
    overflow: 'hidden', // Ensures borderRadius is applied to the button itself
  },
});

export default AuthScreen;
