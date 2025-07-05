import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList, Venue, User } from '../types'; // Ensure all types are imported

// Define props for AdminDashboardScreen
type AdminDashboardScreenProps = StackScreenProps<RootStackParamList, 'AdminDashboard'> & {
  user: User;
  signOut: () => Promise<void>;
};

const BACKEND_BASE_URL = 'https://api.tylerdipietro.com';

const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ navigation, user, signOut }) => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State for adding new venues
  const [newVenue, setNewVenue] = useState<Partial<Venue>>({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    tables: [],
  });

  // State for editing existing venues
  const [isEditingVenue, setIsEditingVenue] = useState<boolean>(false);
  const [editedVenue, setEditedVenue] = useState<Venue | null>(null);

  // State for new table creation within a venue
  const [newTable, setNewTable] = useState<{ tableNumber: string; hourlyRate: string; status: string }>({
    tableNumber: '',
    hourlyRate: '',
    status: 'available',
  });

  const fetchVenues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.firebaseAuthUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch venues');
      }

      const data: Venue[] = await response.json();
      setVenues(data);
    } catch (err: any) {
      console.error('Error fetching venues:', err);
      setError(err.message || 'An unknown error occurred while fetching venues.');
      Alert.alert('Error', `Failed to fetch venues: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const handleCreateVenue = useCallback(async () => {
    if (!newVenue.name || !newVenue.address || !newVenue.latitude || !newVenue.longitude) {
      Alert.alert('Error', 'Please fill in all venue fields.');
      return;
    }

    try {
      const idToken = await user.firebaseAuthUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          ...newVenue,
          latitude: parseFloat(newVenue.latitude as string),
          longitude: parseFloat(newVenue.longitude as string),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create venue');
      }

      Alert.alert('Success', 'Venue created successfully!');
      setNewVenue({ name: '', address: '', latitude: '', longitude: '', tables: [] }); // Reset form
      fetchVenues(); // Refresh the list
    } catch (err: any) {
      console.error('Error creating venue:', err);
      Alert.alert('Error', `Failed to create venue: ${err.message}`);
    }
  }, [newVenue, user, fetchVenues]);

  const startEditVenue = useCallback((venue: Venue) => {
    setIsEditingVenue(true);
    setEditedVenue({ ...venue }); // Create a copy to edit
    // Populate newVenue state for consistency if you want to use the same form,
    // or keep editedVenue separate if the forms are distinct.
    // For simplicity, we'll use editedVenue to manage the edit form directly.
  }, []);

  const saveEditedVenue = useCallback(async () => {
    if (!editedVenue?._id || !editedVenue.name || !editedVenue.address || !editedVenue.latitude || !editedVenue.longitude) {
      Alert.alert('Error', 'Please fill in all required fields for the edited venue.');
      return;
    }
    try {
      const idToken = await user.firebaseAuthUser.getIdToken(true);
      const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${editedVenue._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          ...editedVenue,
          latitude: parseFloat(editedVenue.latitude as string),
          longitude: parseFloat(editedVenue.longitude as string),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update venue');
      }

      Alert.alert('Success', 'Venue updated successfully!');
      setIsEditingVenue(false);
      setEditedVenue(null);
      fetchVenues(); // Refresh the list
    } catch (err: any) {
      console.error('Error updating venue:', err);
      Alert.alert('Error', `Failed to update venue: ${err.message}`);
    }
  }, [editedVenue, user, fetchVenues]);

  const cancelEditVenue = useCallback(() => {
    setIsEditingVenue(false);
    setEditedVenue(null);
  }, []);

  const handleDeleteVenue = useCallback(async (venueId: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this venue? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const idToken = await user.firebaseAuthUser.getIdToken(true);
              const response = await fetch(`${BACKEND_BASE_URL}/api/venues/${venueId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${idToken}`,
                },
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete venue');
              }

              Alert.alert('Success', 'Venue deleted successfully!');
              fetchVenues(); // Refresh the list
            } catch (err: any) {
              console.error('Error deleting venue:', err);
              Alert.alert('Error', `Failed to delete venue: ${err.message}`);
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  }, [user, fetchVenues]);

  const handleAddTable = useCallback(async (venueId: string) => {
    if (!newTable.tableNumber || !newTable.hourlyRate) {
      Alert.alert('Error', 'Please enter both table number and hourly rate.');
      return;
    }
    try {
      const idToken = await user.firebaseAuthUser.getIdToken(true);
      // Assuming you have a specific endpoint for adding tables to a venue
      // This might be /api/tables or /api/venues/:venueId/tables depending on your backend
      // For now, let's assume a generic /api/tables endpoint for creation
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables`, { // This endpoint might need to be adjusted based on your backend
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          venueId: venueId, // Make sure to send venueId
          tableNumber: parseInt(newTable.tableNumber), // Parse to number
          hourlyRate: parseFloat(newTable.hourlyRate),
          status: newTable.status,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add table');
      }

      Alert.alert('Success', `Table ${newTable.tableNumber} added successfully to venue!`);
      setNewTable({ tableNumber: '', hourlyRate: '', status: 'available' }); // Reset form
      fetchVenues(); // Refresh the list to show new table
    } catch (err: any) {
      console.error('Error adding table:', err);
      Alert.alert('Error', `Failed to add table: ${err.message}`);
    }
  }, [newTable, user, fetchVenues]);

  const handleUpdateTableStatus = useCallback(async (venueId: string, tableId: string, newStatus: string) => { // Changed tableNumber to tableId
    try {
      const idToken = await user.firebaseAuthUser.getIdToken(true);
      // Assuming you have a specific endpoint for updating table status
      // This might be /api/tables/:tableId/status
      const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${tableId}/status`, { // Adjusted endpoint
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update table status');
      }

      Alert.alert('Success', `Table status updated to ${newStatus}!`);
      fetchVenues(); // Refresh the list
    } catch (err: any) {
      console.error('Error updating table status:', err);
      Alert.alert('Error', `Failed to update table status: ${err.message}`);
    }
  }, [user, fetchVenues]);

  const handleDeleteTable = useCallback(async (venueId: string, tableId: string, tableNumber: string | number) => { // Changed tableNumber to tableId
    Alert.alert(
      'Confirm Deletion',
      `Are you sure you want to delete table ${tableNumber}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              const idToken = await user.firebaseAuthUser.getIdToken(true);
              // Assuming you have a specific endpoint for deleting tables
              // This might be /api/tables/:tableId
              const response = await fetch(`${BACKEND_BASE_URL}/api/tables/${tableId}`, { // Adjusted endpoint
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${idToken}`,
                },
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete table');
              }

              Alert.alert('Success', `Table ${tableNumber} deleted successfully!`);
              fetchVenues(); // Refresh the list
            } catch (err: any) {
              console.error('Error deleting table:', err);
              Alert.alert('Error', `Failed to delete table: ${err.message}`);
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  }, [user, fetchVenues]);


  if (!user || !user.isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Access Denied. You must be an administrator to view this page.</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.adminPanelTitle}>Admin Dashboard</Text>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <ActivityIndicator size="large" color="#0000ff" />
        ) : (
          <>
            {/* Add New Venue Section */}
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionTitle}>Add New Venue</Text>
              <TextInput
                style={styles.input}
                placeholder="Venue Name"
                value={newVenue.name}
                onChangeText={(text) => setNewVenue({ ...newVenue, name: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Address"
                value={newVenue.address}
                onChangeText={(text) => setNewVenue({ ...newVenue, address: text })}
              />
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Latitude"
                  keyboardType="numeric"
                  value={newVenue.latitude as string}
                  onChangeText={(text) => setNewVenue({ ...newVenue, latitude: text })}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Longitude"
                  keyboardType="numeric"
                  value={newVenue.longitude as string}
                  onChangeText={(text) => setNewVenue({ ...newVenue, longitude: text })}
                />
              </View>
              <TouchableOpacity style={styles.registerButton} onPress={handleCreateVenue}>
                <Text style={styles.registerButtonText}>Create Venue</Text>
              </TouchableOpacity>
            </View>

            {/* Existing Venues List */}
            <Text style={styles.sectionTitle}>Manage Existing Venues ({venues.length})</Text>
            {venues.length === 0 ? (
              <Text style={styles.infoText}>No venues found. Add one above!</Text>
            ) : (
              <View style={styles.venueListContainer}>
                {venues.map((venue) => (
                  <View key={venue._id} style={styles.venueItem}>
                    <Text style={styles.venueName}>{venue.name}</Text>
                    <Text style={styles.venueAddress}>{venue.address}</Text>
                    <Text style={styles.venueDetails}>Lat: {venue.latitude}, Lng: {venue.longitude}</Text>

                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={[styles.smallButton, styles.editButton]}
                        onPress={() => startEditVenue(venue)}
                      >
                        <Text style={styles.smallButtonText}>Edit Venue</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallButton, styles.deleteButton]}
                        onPress={() => handleDeleteVenue(venue._id)}
                      >
                        <Text style={styles.smallButtonText}>Delete Venue</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Edit Venue Form (conditionally rendered) */}
                    {isEditingVenue && editedVenue?._id === venue._id && (
                      <View style={styles.editForm}>
                        <Text style={styles.editFormTitle}>Editing: {editedVenue.name}</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Venue Name"
                          value={editedVenue.name}
                          onChangeText={(text) => setEditedVenue({ ...editedVenue, name: text })}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Address"
                          value={editedVenue.address}
                          onChangeText={(text) => setEditedVenue({ ...editedVenue, address: text })}
                        />
                        <View style={styles.rowInputs}>
                          <TextInput
                            style={[styles.input, styles.halfInput]}
                            placeholder="Latitude"
                            keyboardType="numeric"
                            value={editedVenue.latitude?.toString()}
                            onChangeText={(text) => setEditedVenue({ ...editedVenue, latitude: text })}
                          />
                          <TextInput
                            style={[styles.input, styles.halfInput]}
                            placeholder="Longitude"
                            keyboardType="numeric"
                            value={editedVenue.longitude?.toString()}
                            onChangeText={(text) => setEditedVenue({ ...editedVenue, longitude: text })}
                          />
                        </View>
                        <View style={styles.buttonRow}>
                          <TouchableOpacity
                            style={[styles.smallButton, styles.saveButton]}
                            onPress={saveEditedVenue}
                          >
                            <Text style={styles.smallButtonText}>Save Changes</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.smallButton, styles.cancelButton]}
                            onPress={cancelEditVenue}
                          >
                            <Text style={styles.smallButtonText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Manage Tables Section */}
                    <View style={styles.tablesSection}>
                      <Text style={styles.tableSectionTitle}>Tables:</Text>
                      {/* --- MODIFIED: Defensive check for venue.tables --- */}
                      {venue.tables && venue.tables.length === 0 ? (
                        <Text style={styles.infoText}>No tables for this venue.</Text>
                      ) : (
                        venue.tables?.map((table) => ( // Use optional chaining here
                          <View key={table._id} style={styles.tableItem}> {/* Use _id for key */}
                            <Text style={styles.tableText}>Table {table.tableNumber}</Text>
                            {/* --- MODIFIED: Defensive check for table.hourlyRate --- */}
                            <Text style={styles.tableText}>
                                Rate: {typeof table.hourlyRate === 'number' ? `$${table.hourlyRate.toFixed(2)}/hr` : 'N/A'}
                            </Text>
                            <Text style={styles.tableStatusText}>Status: {table.status}</Text>

                            <Picker
                              selectedValue={table.status}
                              style={styles.picker}
                              onValueChange={(itemValue) => handleUpdateTableStatus(venue._id, table._id, itemValue)} // Pass table._id
                            >
                              <Picker.Item label="Available" value="available" />
                              <Picker.Item label="Occupied" value="occupied" />
                              <Picker.Item label="Maintenance" value="maintenance" />
                            </Picker>

                            <TouchableOpacity
                              style={[styles.smallButton, styles.deleteButton, { marginTop: 5 }]}
                              onPress={() => handleDeleteTable(venue._id, table._id, table.tableNumber)} // Pass table._id
                            >
                              <Text style={styles.smallButtonText}>Delete Table</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                      <View style={styles.addTableForm}>
                        <Text style={styles.addTableTitle}>Add New Table to {venue.name}</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Table Number"
                          keyboardType="numeric"
                          value={newTable.tableNumber}
                          onChangeText={(text) => setNewTable({ ...newTable, tableNumber: text })}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Hourly Rate"
                          keyboardType="numeric"
                          value={newTable.hourlyRate}
                          onChangeText={(text) => setNewTable({ ...newTable, hourlyRate: text })}
                        />
                        <Picker
                          selectedValue={newTable.status}
                          style={styles.picker}
                          onValueChange={(itemValue) => setNewTable({ ...newTable, status: itemValue })}
                        >
                          <Picker.Item label="Available" value="available" />
                          <Picker.Item label="Occupied" value="occupied" />
                          <Picker.Item label="Maintenance" value="maintenance" />
                        </Picker>
                        <TouchableOpacity
                          style={[styles.smallButton, styles.saveButton]}
                          onPress={() => handleAddTable(venue._id)}
                        >
                          <Text style={styles.smallButtonText}>Add Table</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
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
    padding: 20,
    paddingTop: 30,
    alignItems: 'center',
  },
  adminPanelTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#0050b3',
    textAlign: 'center',
  },
  signOutButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 15,
    color: '#333',
    alignSelf: 'flex-start',
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  adminSection: {
    width: '100%',
    padding: 15,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    alignItems: 'center',
  },
  adminSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
    width: '100%',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
  },
  halfInput: {
    width: '48%',
  },
  registerButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 15,
  },
  venueListContainer: {
    width: '100%',
  },
  venueItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  venueName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  venueAddress: {
    fontSize: 16,
    color: '#777',
    marginBottom: 5,
  },
  venueDetails: {
    fontSize: 14,
    color: '#555',
    marginTop: 5,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: '#ffc107',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  saveButton: {
    backgroundColor: '#007bff',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  editForm: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    width: '100%',
  },
  editFormTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  tablesSection: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    width: '100%',
  },
  tableSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  tableItem: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e6ea',
  },
  tableText: {
    fontSize: 15,
    color: '#444',
  },
  tableStatusText: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 5,
    color: '#007bff', // Example color
  },
  picker: {
    width: '100%',
    marginBottom: 10,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
  },
  addTableForm: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    width: '100%',
  },
  addTableTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
});

export default AdminDashboardScreen;
