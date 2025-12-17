import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

if (!process.env.SENDGRID_API_KEY) {
  console.error('Missing SendGrid API key');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ detail: 'Method not allowed' });
    }

    // Validate environment variables
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return res.status(500).json({ detail: 'Server configuration error: Missing Supabase credentials' });
    }

    if (!process.env.SENDGRID_API_KEY) {
      console.error('Missing SendGrid configuration');
      return res.status(500).json({ detail: 'Server configuration error: Missing SendGrid API key' });
    }

    console.log('Request body:', req.body);

    const { email, company, role, team_size, db_type, slack_workspace_size, pricing_feedback, notes } = req.body;

    // Validate required fields
    if (!email || !company || !role || !team_size || !db_type) {
      return res.status(400).json({ detail: 'Missing required fields' });
    }

    // Insert into Supabase
    const { data, error } = await supabase.from('early_access_requests').insert([{
      email,
      company,
      role,
      team_size,
      db_type,
      slack_workspace_size,
      pricing_feedback,
      notes
    }]);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ detail: error.message || 'Database error' });
    }

    // Send email via SendGrid
    try {
      await sgMail.send({
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com',
        subject: 'Founding Access Request Received',
        html: `
          <p>Hi there,</p>
          <p>Thanks for requesting founding access to Sidekick! We're reviewing requests and will invite teams in waves.</p>
          <p>This is not instant access — you'll receive setup instructions once selected.</p>
          <p>Thanks,<br><strong>The Sidekick Team</strong></p>
        `
      });
      console.log('Email sent successfully to:', email);
    } catch (emailErr) {
      console.error('SendGrid error:', emailErr);
      // Don't fail the request if email fails, but log it
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ detail: err.message || 'Server error' });
  }
}
