
import { supabase } from '../lib/supabase';

export interface UserProfile {
    id: string;
    email: string; // Kept for internal app usage
    name?: string;
    birthdate?: string;
    use_case?: string;
    source?: string;
    is_table_missing?: boolean; // New flag to signal UI about missing DB table
}

export const getProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Row not found (normal for new users)
        
        // We allow read to fail gracefully so the app loads, but flag it
        if (error.code === 'PGRST205' || error.code === '42P01') {
            console.warn("Profiles table missing in Supabase. Returning default profile with warning flag.");
            return { 
                id: userId, 
                email: 'unknown', 
                name: 'User',
                is_table_missing: true 
            };
        }

        console.error("Error fetching profile:", JSON.stringify(error));
        return null;
    }
    return data;
};

export const updateProfile = async (profile: UserProfile) => {
    // EXCLUDE email and internal flags from the payload sent to Supabase
    const { email, is_table_missing, ...dbProfile } = profile;

    const { error } = await supabase
        .from('profiles')
        .upsert(dbProfile);

    if (error) {
        // Log full error details for debugging and THROW it so the UI knows it failed
        console.error("Profile update error:", JSON.stringify(error));
        throw error;
    }
};
