import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const MAX_SIGNUPS = 30;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ detail: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ detail: 'Server configuration error' });
    }

    const { email } = req.query;

    // Get current count
    const { count, error: countError } = await supabase
      .from('early_access_requests')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error getting count:', countError);
      return res.status(500).json({ detail: 'Error checking signup count' });
    }

    const currentCount = count || 0;
    const isFull = currentCount >= MAX_SIGNUPS;
    const spotsRemaining = Math.max(0, MAX_SIGNUPS - currentCount);

    // If email provided, check if it already exists
    let emailExists = false;
    if (email) {
      const { data: existingEmail, error: emailError } = await supabase
        .from('early_access_requests')
        .select('email')
        .eq('email', email.toLowerCase().trim())
        .limit(1);

      if (!emailError && existingEmail && existingEmail.length > 0) {
        emailExists = true;
      }
    }

    return res.status(200).json({
      currentCount,
      maxSignups: MAX_SIGNUPS,
      isFull,
      spotsRemaining,
      emailExists: email ? emailExists : null
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ detail: err.message || 'Server error' });
  }
}

