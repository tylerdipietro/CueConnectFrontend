// src/services/AuthService.ts
// This file encapsulates all Google Sign-In and Firebase Authentication logic.
// It uses React Context to provide authentication state and functions to the entire app.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth'; // Firebase Auth module

// Define the shape of the user context
interface UserContextType {
  user: auth.FirebaseAuthTypes.User | null;
  signInWithGoogle: () => Promise<auth.FirebaseAuthTypes.User | null>;
  signOut: () => Promise<void>;
}

// Create a Context for user authentication data
const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * AuthService provides utility functions for Google Sign-In and Firebase Authentication.
 * @module AuthService
 */
export const AuthService = {
  /**
   * Handles the Google Sign-In process, authenticating with Firebase.
   * @async
   * @returns {Promise<auth.FirebaseAuthTypes.User | null>} A Firebase User object on success, or null on failure.
   */
  signInWithGoogle: async (): Promise<auth.FirebaseAuthTypes.User | null> => {
    try {
      // Check if the device supports Google Play Services (required for Android)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Get the user's ID token from Google Sign-In (from the native SDK)
      const { idToken } = await GoogleSignin.signIn();

      // Create a Firebase credential using the Google ID token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);

      // Sign in to Firebase with the Google credential
      const userCredential = await auth().signInWithCredential(googleCredential);

      console.log('Google sign-in successful:', userCredential.user.toJSON());
      return userCredential.user;
    } catch (error: any) { // Use 'any' for unknown error types from external libraries
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('Google Sign-In cancelled by user');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Google Sign-In already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('Google Play Services not available or outdated');
      } else {
        console.error('Google Sign-In error:', error);
      }
      return null;
    }
  },

  /**
   * Handles Firebase user sign-out and Google session revocation.
   * @async
   */
  signOut: async (): Promise<void> => {
    try {
      // Revoke Google access token (optional, but good practice for full logout)
      await GoogleSignin.revokeAccess();
      // Sign out from Firebase
      await auth().signOut();
      console.log('User signed out successfully!');
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  /**
   * React Native component for a generic Sign-In button.
   * @param {Object} props - Component props.
   * @param {() => void} props.onSignIn - Callback function when sign-in is initiated.
   */
  SignInButton: ({ onSignIn }: { onSignIn: () => void }) => (
    <TouchableOpacity style={styles.button} onPress={onSignIn}>
      <Text style={styles.buttonText}>Sign in with Google</Text>
    </TouchableOpacity>
  ),

  /**
   * React Native component for a generic Sign-Out button.
   * @param {Object} props - Component props.
   * @param {() => void} props.onSignOut - Callback function when sign-out is initiated.
   */
  SignOutButton: ({ onSignOut }: { onSignOut: () => void }) => (
    <TouchableOpacity style={styles.button} onPress={onSignOut}>
      <Text style={styles.buttonText}>Sign Out</Text>
    </TouchableOpacity>
  ),
};

/**
 * UserProvider component wraps your app to provide user authentication context.
 * It listens to Firebase auth state changes and updates the context accordingly.
 * @param {Object} props - Component props.
 * @param {React.ReactNode} props.children - React children to render within the provider.
 */
export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<auth.FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);

  // Listener for Firebase authentication state changes
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(firebaseUser => {
      setUser(firebaseUser);
      setLoading(false); // Authentication state has been loaded
    });
    // Unsubscribe from the listener when the component unmounts
    return subscriber;
  }, []);

  // If still loading auth state, display a loading indicator
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Checking authentication...</Text>
      </View>
    );
  }

  // Define the context value explicitly before passing it to the provider
  const contextValue: UserContextType = {
    user,
    signInWithGoogle: AuthService.signInWithGoogle,
    signOut: AuthService.signOut,
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

/**
 * Custom hook to easily access user context throughout the app.
 * Throws an error if used outside of a UserProvider.
 * @returns {UserContextType} An object containing the current user, signInWithGoogle, and signOut functions.
 */
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

// Styles for buttons and loading indicators
const styles = StyleSheet.create({
  button: {
    backgroundColor: '#4285F4', // Google blue
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
