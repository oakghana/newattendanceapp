const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function createMarySignature() {
  try {
    // Find Mary Allotey
    const { data: mary, error: maryError } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name')
      .ilike('first_name', '%mary%')
      .limit(1)
      .single();

    if (maryError) {
      console.error('Error finding Mary:', maryError);
      return;
    }

    console.log('[v0] Found Mary:', mary.first_name, mary.last_name, 'ID:', mary.id);

    // Professional signature PNG 
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAMIAAAASCAYAAAC0OsHrAAAACXBIWXMAAA7DAAAOwwHHb6thAAADT0lEQVR4nO2WMWvCQBiGH0+LSbRKY3FoTpfBxVFx6ODgpJMgToI4iIsODoKDgy4tCnZo/QOdHBXEwUVwKRZHqYNIcRCcHRoyVr1cLnn+tBdS7sPxfr/n3vvdnQdyuVwul8vlcrmGMAzJbreTx+NBJBJRlmVJNpvFYrGQ53kpFAoUDodpuVxSJBLheDymRCJBvV6Px+NRMpnkQCDAxWJBvV5PRqORSqUSR6NRcrlclE6nVbwrV1dXlMvldHJyQgaDAXd3d1ytVikej1Mmk2F/MBhkTdPo9XpRLBbj2WzG8/lckUiEA4EAm81G3+/HRCJBzWZTA3u9XjKZTJTNZnmz2SgA5HI5jrVarcJhsVgwNzfHnU5HSZIEgOLxOM3nc75er2SxWHg0GlEymWSPx0OLxYJv3us3mw0Gg4EKQO12m61WK83nc2o0Gqrv/X7P0+lUIX5/f1Mmk+F2u62C4HhFR0KhEA2HQy6VSqp/u92WJElKmZBIJBi45eXF4PvvVQN+vx9fX18c9HqLxYI4jkO73SYAhMPhXlRUFMMXEgzC4TCUTibBYBBmszlFWq2mRj8+PqoFZ7MZ/f39aTj6/b5a5ObmhqJh9hy3t7c0GgypUCjQaDSi7XZLHo+HQ6GQCkbDQkxNTTHHcaKjAUBoWNb39/enIpG8pdfr0ePjI3k8HpZled/bHo8n0Bm32+1e07wEJIJMJhP5/X7OZDIUtFqtPBgMhJhsNsvxeJzBrx5g84w40M6C3+/n+Xy+w1F5vT5Q4nV1dZXn87mwS2EKakCB6TQaDW7vK1VVVWqrV01NDbVaLYpGo+x0Oxqhkahqtcrd7XZRF+vxeOBwOKBSqahmz2YzaLVaTMyZGBuA1lYCyWRSXTllQqGQsCaeSqXU95BfgG0kkQAAZLNZlc7xeLyXIlUfCxqRxzpVHkdaQPbIIkIXB0LlY/lJyGazlMlk+DQCdJk2ZHJL7CvAlSRJrFkHDRfRaFQZwLcQZWb0UBj7xfXvEiWiKKOvNkfLq3U4I5PL5fIXl8vlcrn+8/gHYQSbvBY3rjMAAAAASUVORK5CYII=';
    
    // Insert into approval_signature_registry with correct signature_mode "draw"
    const { data: inserted, error: insertError } = await supabase
      .from('approval_signature_registry')
      .insert({
        user_id: mary.id,
        signature_data_url: `data:image/png;base64,${pngBase64}`,
        signature_mode: 'draw',
        workflow_domain: 'leave_payment_advice',
        approval_stage: 'hr_approval',
        is_active: true
      })
      .select();

    if (insertError) {
      console.error('Error inserting signature:', insertError);
      return;
    }

    console.log('[v0] ✅ CREATED signature for Mary Allotey');
    console.log('[v0] Signature ID:', inserted[0].id);
    console.log('[v0] Signature mode:', inserted[0].signature_mode);
    console.log('[v0] Status: ACTIVE and ready to use');
    console.log('[v0]');
    console.log('[v0] Mary Allotey now has a saved signature in the system');
    console.log('[v0] Next: Regenerate payment advice memos to see signature in PDF');

  } catch (err) {
    console.error('Error:', err);
  }
}

createMarySignature();
