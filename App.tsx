import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
  Image, // Don't forget to import Image if you use it
} from 'react-native';

// Import Firebase Auth and Google Sign-In
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // Import FirebaseAuthTypes for type hints
import { GoogleSignin, GoogleSigninButton, statusCodes } from '@react-native-google-signin/google-signin';

// Define the type for the user state
type User = FirebaseAuthTypes.User | null;

// The main App functional component
const App = (): JSX.Element => { // Explicitly define the return type as JSX.Element
  // Set an initializing state whilst Firebase connects
  const [initializing, setInitializing] = useState<boolean>(true);
  // User state will hold the authenticated Firebase user, explicitly typed
  const [user, setUser] = useState<User>(null);

  // 1. Configure Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '47513412219-nqkiaarisrql1cbjrb7c9a95f12f7r4v.apps.googleusercontent.com', // REQUIRED for backend auth
    });
  }, []); // Empty dependency array means this runs once on mount

  // 2. Handle user state changes with Firebase Auth listener
  useEffect(() => {
    // The subscriber function implicitly gets the user type from Firebase SDK
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return subscriber; // unsubscribe on unmount
  }, []);

  // Type the 'firebaseUser' parameter
  function onAuthStateChanged(firebaseUser: FirebaseAuthTypes.User | null) {
    setUser(firebaseUser);
    if (initializing) setInitializing(false);
  }

  // 3. Google Sign-In logic
  async function onGoogleButtonPress(): Promise<void> { // Explicitly define return type as Promise<void>
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Destructure 'idToken' with type annotation
      const { idToken } = await GoogleSignin.signIn();

      // Create a Firebase credential with the Google ID token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);

      // Sign-in the user with Firebase using the Google credential
      await auth().signInWithCredential(googleCredential);
      console.log('Signed in with Google to Firebase!');

    } catch (error: any) { // Type the 'error' as 'any' or a more specific error type if known
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('Google Sign-In cancelled');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Google Sign-In in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('Google Play Services not available or outdated');
      } else {
        console.error('Google Sign-In error:', error);
      }
    }
  }

  // 4. Sign out logic
  async function signOut(): Promise<void> { // Explicitly define return type as Promise<void>
    try {
      await auth().signOut();
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      console.log('User signed out!');
    } catch (error: any) {
      console.error('Sign out error:', error);
    }
  }

  // Display a loading indicator while Firebase is initializing
  if (initializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading Firebase...</Text>
      </View>
    );
  }

  // Render UI based on user authentication status
  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>Please sign in to continue.</Text>
        <GoogleSigninButton
          style={styles.googleButton}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={onGoogleButtonPress}
          disabled={false}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user.displayName || user.email}!</Text>
      <Text style={styles.subtitle}>You are signed in with:</Text>
      <Text style={styles.emailText}>{user.email}</Text>
      {user.photoURL && (
        <Image source={{ uri: user.photoURL }} style={styles.profileImage} />
      )}
      <Button title="Sign Out" onPress={signOut} />
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
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  googleButton: {
    width: 192,
    height: 48,
    marginTop: 20,
  },
  emailText: {
    fontSize: 18,
    marginBottom: 10,
    color: '#333',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginTop: 20,
    marginBottom: 20,
  },
});

export default App;