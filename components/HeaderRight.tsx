import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, User } from '../App'; // Import User type from App.tsx

// Define the type for the navigation prop specific to this component
type HeaderRightNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface HeaderRightProps {
  currentUser: User; // Still accepts the full User object from HomeScreen
}

const HeaderRight: React.FC<HeaderRightProps> = ({ currentUser }) => {
  const navigation = useNavigation<HeaderRightNavigationProp>();

  // Debugging log for HeaderRight
  console.log(`[HeaderRight] Rendering. Current user tokenBalance: ${currentUser?.tokenBalance}`);
  console.log(`[HeaderRight] Type of currentUser: ${typeof currentUser}`);
  console.log(`[HeaderRight] Does currentUser have getIdToken? ${typeof (currentUser as any)?.getIdToken}`);


  const handlePress = () => {
    if (currentUser && currentUser.uid) {
      // Pass only serializable properties to TokenScreen
      navigation.navigate('TokenScreen', {
        uid: currentUser.uid,
        tokenBalance: currentUser.tokenBalance ?? 0,
      });
    } else {
      Alert.alert('Error', 'User not logged in. Please sign in to view and load tokens.');
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
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
