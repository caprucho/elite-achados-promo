require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios no .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = { supabase };
