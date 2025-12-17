import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {
  try {
    if(req.method !== 'POST'){
      return res.status(405).json({ detail: 'Method not allowed' });
    }

    console.log('Request body:', req.body);

    const { email, company, role, team_size, db_type, slack_workspace_size, pricing_feedback, notes } = req.body;

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

    if(error){
      console.error('Supabase error:', error);
      return res.status(500).json({ detail: error.message });
    }

    try {
      await sgMail.send({
        to: email,
        from: 'founders@yourdomain.com',
        subject: 'Founding Access Request Received',
        html: `
          <p>Hi ${email},</p>
          <p>Thanks for requesting founding access! We’re reviewing requests and will invite teams in waves.</p>
          <p>This is not instant access — you’ll receive setup instructions once selected.</p>
          <p>Thanks,<br><strong>Your Founding Team</strong></p>
        `
      });
    } catch(emailErr){
      console.error('SendGrid error:', emailErr);
    }

    return res.status(200).json({ success: true });

  } catch(err){
    console.error('Unexpected error:', err);
    return res.status(500).json({ detail: err.message || 'Server error' });
  }
}
