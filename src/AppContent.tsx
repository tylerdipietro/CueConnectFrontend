// src/AppContent.tsx
import React from 'react';
import { View, Text, Button, StyleSheet, Image } from 'react-native';
import { useUser } from '../src/services/AuthService'; // Import useUser hook for user info and sign out

/**
 * AppContent Component
 * This component will display the main content of your application
 * after the user has successfully authenticated.
 * For now, it shows a welcome message and a sign-out button.
 */
const AppContent = () => {
  const { user, signOutUser } = useUser(); // Access user and signOutUser from context

  if (!user) {
    // This case should ideally not happen if App.tsx is handling routing correctly,
    // but it's a safeguard.
    return (
      <View style={styles.container}>
        <Text>User not found. Please sign in.</Text>
        <Button title="Go to Sign In" onPress={signOutUser} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {user.photoURL && (
        <Image source={{ uri: user.photoURL }} style={styles.profileImage} />
      )}
      <Text style={styles.title}>Welcome, {user.displayName || user.email}!</Text>
      <Text style={styles.subtitle}>You are successfully signed in.</Text>

      {/* Placeholder for future features */}
      <View style={styles.featureSection}>
        <Text style={styles.featureTitle}>Your Billiards Journey Starts Here</Text>
        <Text style={styles.featureDescription}>
          Soon you'll be able to find tables, join waitlists, pay for games,
          and track your FargoRate!
        </Text>
        {/* We will add more UI elements for your app's features here */}
      </View>

      <Button title="Sign Out" onPress={signOutUser} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#e0f7fa', // Light blue background
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#007bff',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#212121',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#424242',
    marginBottom: 30,
    textAlign: 'center',
  },
  featureSection: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    elevation: 3, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#007bff',
  },
  featureDescription: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default AppContent;
