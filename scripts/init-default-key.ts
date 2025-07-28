import { supabase } from '../lib/supabaseClient';

async function initializeDefaultAccessKey() {
  const defaultKey = process.env.DEFAULT_ACCESS_KEY;
  
  if (!defaultKey) {
    console.log('No DEFAULT_ACCESS_KEY found in environment variables');
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('access_keys')
      .upsert([{
        lpb_key: defaultKey,
        is_active: true
      }], {
        onConflict: 'lpb_key'
      });
    
    if (error) {
      console.error('Error inserting default access key:', error);
    } else {
      console.log('Default access key initialized successfully');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initializeDefaultAccessKey().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Initialization failed:', error);
    process.exit(1);
  });
}

export { initializeDefaultAccessKey };