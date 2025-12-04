
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://puxngrplxfugwgpsccgu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1eG5ncnBseGZ1Z3dncHNjY2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDExMjksImV4cCI6MjA4MDQxNzEyOX0.e3vv3fDlW7NK7bMATbjFw2vk5wSh0vfzo41rhti_Ys8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
