import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, User } from '../types'; // Import User and RootStackParamList from types.ts
import auth from '@react-native-firebase/auth'; // Import auth to get live user if needed

// Define the type for the navigation prop specific to this component
type HeaderRightNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface HeaderRightProps {
  currentUser: User; // Accepts the new User object from App.tsx
}

const HeaderRight: React.FC<HeaderRightProps> = ({ currentUser }) => {
  const navigation = useNavigation<HeaderRightNavigationProp>();

  // Debugging log for HeaderRight
  console.log(`[HeaderRight] Rendering. Current user object:`, JSON.stringify(currentUser, (key, value) => {
    // Custom replacer to handle circular references and functions
    if (typeof value === 'function') {
      return `[Function: ${key}]`;
    }
    if (key === 'firebaseAuthUser' && value && typeof value === 'object') {
      // For firebaseAuthUser, only show a few key properties to avoid circular issues
      return {
        uid: value.uid,
        email: value.email,
        displayName: value.displayName,
        // Indicate presence of getIdToken without calling it
        getIdToken_exists: typeof value.getIdToken === 'function' ? 'yes' : 'no'
      };
    }
    return value;
  }, 2));

  console.log(`[HeaderRight] Current user tokenBalance: ${currentUser?.tokenBalance}`);
  // Now, check the getIdToken method from the wrapped firebaseAuthUser object
  console.log(`[HeaderRight] Does currentUser?.firebaseAuthUser?.getIdToken? ${typeof currentUser?.firebaseAuthUser?.getIdToken}`);


  const handlePress = () => {
    // Access uid and tokenBalance from the new User object structure
    // Added a more robust check for currentUser.firebaseAuthUser
    if (currentUser && currentUser.firebaseAuthUser && currentUser.firebaseAuthUser.uid) {
      navigation.navigate('TokenScreen', {
        user: { // Pass the nested 'user' object as expected by TokenScreen's route.params
          uid: currentUser.firebaseAuthUser.uid,
          tokenBalance: currentUser.tokenBalance ?? 0,
        },
      });
    } else {
      // This alert will now be more accurate if firebaseAuthUser is missing
      Alert.alert('Error', 'User authentication data is not fully loaded. Please try again or re-login.');
      console.error('[HeaderRight] Cannot navigate to TokenScreen: currentUser or currentUser.firebaseAuthUser.uid is missing.', { currentUser });
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      {/* Display tokenBalance from the new User object structure */}
      <Text style={styles.tokenText}>Tokens: {currentUser?.tokenBalance ?? '...'}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 15,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#007bff', // Blue background for the token button
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  tokenText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default HeaderRight;
