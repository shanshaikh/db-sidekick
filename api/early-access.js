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

const MAX_SIGNUPS = 30;

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

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check current count
    const { count, error: countError } = await supabase
      .from('early_access_requests')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error checking count:', countError);
      return res.status(500).json({ detail: 'Error checking signup availability' });
    }

    const currentCount = count || 0;
    if (currentCount >= MAX_SIGNUPS) {
      return res.status(400).json({ detail: 'Sorry, we\'ve reached the limit of 30 founding beta signups.' });
    }

    // Check if email already exists
    const { data: existingEmail, error: emailCheckError } = await supabase
      .from('early_access_requests')
      .select('email')
      .eq('email', normalizedEmail)
      .limit(1);

    if (emailCheckError) {
      console.error('Error checking email:', emailCheckError);
      return res.status(500).json({ detail: 'Error checking email availability' });
    }

    if (existingEmail && existingEmail.length > 0) {
      return res.status(400).json({ detail: 'You have already signed up with this email.' });
    }

    // Insert into Supabase
    const { data, error } = await supabase.from('early_access_requests').insert([{
      email: normalizedEmail,
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
      // Check if it's a unique constraint violation
      if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
        return res.status(400).json({ detail: 'You have already signed up with this email.' });
      }
      return res.status(500).json({ detail: error.message || 'Database error' });
    }

    // Send email via SendGrid
    try {
      // Support display name with verified email
      // Option 1: Set SENDGRID_FROM_EMAIL as "Display Name <verified-email@domain.com>"
      // Option 2: Set SENDGRID_FROM_EMAIL (verified email) and SENDGRID_FROM_NAME (display name) separately
      let fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com';
      
      if (process.env.SENDGRID_FROM_NAME && process.env.SENDGRID_FROM_EMAIL) {
        // Combine display name with verified email
        fromEmail = `${process.env.SENDGRID_FROM_NAME} <${process.env.SENDGRID_FROM_EMAIL}>`;
      }
      // If SENDGRID_FROM_EMAIL already includes a name (e.g., "Name <email@domain.com>"), use it as-is
      
      console.log('Attempting to send email to:', email, 'from:', fromEmail);
      
      await sgMail.send({
        to: email,
        from: fromEmail,
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
      console.error('SendGrid error response:', emailErr.response?.body);
      console.error('SendGrid error message:', emailErr.message);
      // Log the full error for debugging
      if (emailErr.response) {
        console.error('SendGrid status code:', emailErr.response.statusCode);
        console.error('SendGrid response body:', JSON.stringify(emailErr.response.body, null, 2));
      }
      // Don't fail the request if email fails, but log it for debugging
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ detail: err.message || 'Server error' });
  }
}
