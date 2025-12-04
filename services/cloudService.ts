
import { supabase } from '../lib/supabase';

interface MapData {
    nodes: any[];
    edgeData: any;
    drawings: any[];
    viewport: any;
    projectName: string;
    canvasSettings: any;
    lastModified?: number;
    isDeleted?: boolean;
    isShared?: boolean;
}

export const CLOUD_UNAVAILABLE = 'CLOUD_UNAVAILABLE';
let isCloudDisabled = false;

export const resetCloudStatus = () => {
    isCloudDisabled = false;
    console.log("Cloud status reset. Attempting connection...");
};

// --- MIGRATION LOGIC ---

export const migrateLocalMapsToCloud = async (userId: string) => {
    if (isCloudDisabled) return;

    console.log("Starting migration for user:", userId);
    const indexStr = localStorage.getItem('singularity-maps-index');
    if (!indexStr) return;

    // Pre-flight check to ensure table exists before spamming inserts
    const { error: preCheckError } = await supabase.from('maps').select('id').limit(1);
    if (preCheckError) {
        if (preCheckError.code === 'PGRST205' || preCheckError.code === '42P01') {
            console.info("Maps table missing in Supabase. Aborting migration to prevent errors.");
            isCloudDisabled = true;
            return;
        }
    }

    try {
        const index = JSON.parse(indexStr);
        if (!Array.isArray(index)) return;

        for (const item of index) {
            const localKey = `singularity-map-${item.id}`;
            const mapDataStr = localStorage.getItem(localKey);
            
            if (mapDataStr) {
                try {
                    const mapData = JSON.parse(mapDataStr);
                    const projectName = mapData.projectName || item.name;
                    
                    const { data: existing, error: checkError } = await supabase
                        .from('maps')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('map_data->>projectName', projectName) 
                        .maybeSingle();
                    
                    if (checkError) {
                         if (checkError.code === 'PGRST205' || checkError.code === '42P01') {
                            console.warn("Maps table missing in Supabase. Aborting migration.");
                            isCloudDisabled = true;
                            return; 
                         }
                    }

                    if (!existing) {
                        const payload = {
                            ...mapData,
                            projectName: projectName,
                            lastModified: item.lastModified,
                            isDeleted: item.isDeleted || false,
                            isShared: false
                        };

                         const { error } = await supabase.from('maps').insert({
                            user_id: userId,
                            map_data: payload
                        });

                        if (error) {
                            if (error.code === 'PGRST205' || error.code === '42P01') {
                                console.warn("Maps table missing. Aborting migration.");
                                isCloudDisabled = true;
                                return;
                            }
                            console.error("Failed to migrate map:", item.name, JSON.stringify(error));
                        } else {
                            console.log("Migrated:", item.name);
                        }
                    }
                } catch (e) {
                    console.error("Error parsing local map during migration", e);
                }
            }
        }
        console.log("Migration check complete.");
    } catch (e) {
        console.error("Migration failed", e);
    }
};

// --- CRUD OPERATIONS ---

export const fetchMapsFromCloud = async () => {
    if (isCloudDisabled) return null;

    const { data, error } = await supabase
        .from('maps')
        .select('id, map_data, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
            console.info("Maps table not found in Supabase. Signaling fallback to local.");
            isCloudDisabled = true;
            return null; 
        }
        console.error("fetchMapsFromCloud error:", JSON.stringify(error));
        throw error;
    }

    // If we got data successfully, ensure cloud is enabled (in case it was previously disabled)
    isCloudDisabled = false;

    return data.map((m: any) => {
        const md = m.map_data || {};
        return {
            id: m.id,
            name: md.projectName || 'Untitled Mind Map',
            lastModified: md.lastModified || new Date(m.created_at).getTime(),
            isDeleted: md.isDeleted || false,
            isShared: md.isShared || false
        };
    });
};

export const loadMapFromCloud = async (mapId: string) => {
    if (isCloudDisabled) return null;

    const { data, error } = await supabase
        .from('maps')
        .select('map_data')
        .eq('id', mapId)
        .single();
        
    if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
            console.info("Cloud map load failed (Table missing). Returning null.");
            isCloudDisabled = true;
            return null;
        }
        throw error;
    }
    return data.map_data;
};

export const saveMapToCloud = async (mapId: string, mapData: MapData) => {
    if (isCloudDisabled) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    if (mapId.length < 20) {
        console.warn("Cannot save local-only map to cloud directly via ID update.");
        return; 
    }

    const payload = {
        ...mapData,
        lastModified: Date.now(),
        isDeleted: false 
    };

    const { error } = await supabase
        .from('maps')
        .update({
            map_data: payload
        })
        .eq('id', mapId);

    if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
            console.info("Cloud save failed (Table missing).");
            isCloudDisabled = true;
            return; 
        }
        throw error;
    }
};

export const createMapInCloud = async (mapData: MapData) => {
    if (isCloudDisabled) throw new Error(CLOUD_UNAVAILABLE);

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Not authenticated");

    const payload = {
        ...mapData,
        lastModified: Date.now(),
        isDeleted: false
    };

    const { data, error } = await supabase
        .from('maps')
        .insert({
            user_id: user.id,
            map_data: payload
        })
        .select()
        .single();

    if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
            isCloudDisabled = true;
            throw new Error(CLOUD_UNAVAILABLE);
        }
        console.error("createMapInCloud error:", JSON.stringify(error));
        throw error;
    }
    
    return {
        id: data.id,
        name: data.map_data.projectName
    };
};

export const deleteMapFromCloud = async (mapId: string, permanent: boolean = false) => {
    if (isCloudDisabled) return;

    if (permanent) {
        const { error } = await supabase.from('maps').delete().eq('id', mapId);
        if (error) {
            if (error.code === 'PGRST205' || error.code === '42P01') {
                isCloudDisabled = true;
                return;
            }
            throw error;
        }
    } else {
        const { data: current, error: fetchError } = await supabase
            .from('maps')
            .select('map_data')
            .eq('id', mapId)
            .single();
            
        if (fetchError) return;

        const updatedData = {
            ...current.map_data,
            isDeleted: true
        };

        const { error } = await supabase
            .from('maps')
            .update({ map_data: updatedData })
            .eq('id', mapId);

        if (error) {
            if (error.code === 'PGRST205' || error.code === '42P01') {
                isCloudDisabled = true;
                return;
            }
            throw error;
        }
    }
};
