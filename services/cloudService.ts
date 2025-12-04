
import { supabase } from '../lib/supabase';
import { generateId } from '../constants';

interface MapData {
    nodes: any[];
    edgeData: any;
    drawings: any[];
    viewport: any;
    projectName: string;
    canvasSettings: any;
}

// --- MIGRATION LOGIC ---

export const migrateLocalMapsToCloud = async (userId: string) => {
    console.log("Starting migration for user:", userId);
    const indexStr = localStorage.getItem('singularity-maps-index');
    if (!indexStr) return;

    try {
        const index = JSON.parse(indexStr);
        if (!Array.isArray(index)) return;

        for (const item of index) {
            const localKey = `singularity-map-${item.id}`;
            const mapDataStr = localStorage.getItem(localKey);
            
            if (mapDataStr) {
                try {
                    const mapData = JSON.parse(mapDataStr);
                    
                    // Check if already exists to avoid duplicates (optional, but good practice)
                    // For simplicity in this MVP, we just insert. 
                    // Real-world: Check by name or maintain a 'synced' flag in local storage.
                    
                    const { error } = await supabase.from('maps').insert({
                        user_id: userId,
                        name: mapData.projectName || item.name,
                        content: mapData, // JSONB column
                        last_modified: item.lastModified,
                        is_deleted: item.isDeleted || false
                    });

                    if (error) {
                        console.error("Failed to migrate map:", item.name, error);
                    } else {
                        console.log("Migrated:", item.name);
                        // Optional: Mark as migrated or delete local?
                        // localStorage.removeItem(localKey); 
                    }
                } catch (e) {
                    console.error("Error parsing local map during migration", e);
                }
            }
        }
        // Update local index or clear it? 
        // For now, we keep local copy as backup/offline mode, 
        // but the App will prioritize Cloud data if logged in.
    } catch (e) {
        console.error("Migration failed", e);
    }
};

// --- CRUD OPERATIONS ---

export const fetchMapsFromCloud = async () => {
    const { data, error } = await supabase
        .from('maps')
        .select('id, name, last_modified, is_deleted')
        .order('last_modified', { ascending: false });

    if (error) throw error;
    return data.map((m: any) => ({
        id: m.id,
        name: m.name,
        lastModified: m.last_modified,
        isDeleted: m.is_deleted
    }));
};

export const loadMapFromCloud = async (mapId: string) => {
    const { data, error } = await supabase
        .from('maps')
        .select('content, name')
        .eq('id', mapId)
        .single();
        
    if (error) throw error;
    return data.content;
};

export const saveMapToCloud = async (mapId: string, mapData: MapData) => {
    // Check if map exists (this logic assumes mapId is UUID from Supabase, 
    // but if it's a local ID (short string), we need to handle creation vs update)
    
    // Strategy: 
    // 1. If mapId is a UUID (36 chars), update.
    // 2. If mapId is local ID (short), create new row and return new UUID?
    //    This complicates the App state. 
    //    Simpler: When App loads, if logged in, creating a map creates a UUID immediately.
    
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    // For now, we assume the App has switched to using UUIDs or we perform an upsert based on ID
    // Since local IDs are like 'node-xyz', and Supabase IDs are UUIDs.
    
    // Heuristic: If ID length < 20, it's local. Create new on Cloud.
    if (mapId.length < 20) {
        // Is it already migrated? (Check logic needed in App, or we just insert new)
        // Ideally, migration handled this.
        // Let's treat save as Upsert if possible, but ID types differ.
        
        // NOTE: This part requires the App to switch its ID system.
        // For Phase 1, we will just insert and let Supabase generate ID, 
        // then client needs to update its reference. 
        // HOWEVER, to keep it simple without refactoring the whole App's ID system right now:
        // We can store the local ID in the 'content' JSONB, but use UUID for the row.
        
        // BETTER APPROACH FOR HYBRID:
        // When "saving", if we don't have a cloud_id mapped, insert and get UUID.
        // Map local_id -> cloud_id in a look-up table in localStorage?
        
        // Implementation for SaaS transition:
        // Just Upsert based on 'id' column if we force UUIDs.
        // Since we can't change local IDs easily in one go, let's stick to:
        // "If logged in, create maps with UUIDs". 
        // Migration will convert local IDs to UUIDs in the cloud.
        
        return; // Handled by specialized logic if needed, but standard 'save' expects valid row ID
    }

    const { error } = await supabase
        .from('maps')
        .upsert({
            id: mapId,
            user_id: user.id,
            name: mapData.projectName,
            content: mapData,
            last_modified: Date.now(),
            is_deleted: false
        });

    if (error) throw error;
};

export const createMapInCloud = async (mapData: MapData) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
        .from('maps')
        .insert({
            user_id: user.id,
            name: mapData.projectName,
            content: mapData,
            last_modified: Date.now(),
            is_deleted: false
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteMapFromCloud = async (mapId: string, permanent: boolean = false) => {
    if (permanent) {
        const { error } = await supabase.from('maps').delete().eq('id', mapId);
        if (error) throw error;
    } else {
        const { error } = await supabase.from('maps').update({ is_deleted: true }).eq('id', mapId);
        if (error) throw error;
    }
};
