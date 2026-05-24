'use server'

import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface MemoDistributionParams {
  memoType: 'deferment' | 'recall'
  memoId: string
  staffId: string
  hodId?: string
  memoData: any
  signatureImageUrl?: string
}

export async function distributeMemoToRecipients(params: MemoDistributionParams) {
  try {
    const { memoType, memoId, staffId, hodId, memoData, signatureImageUrl } = params
    
    console.log('[v0] Starting memo distribution:', {
      memoType,
      memoId,
      staffId,
      hodId
    })

    // Get staff and HOD user info
    const { data: staffProfile } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, email')
      .eq('id', staffId)
      .single()

    // Determine table and distribution list
    let tableName: string
    let distributionList: Array<{ id: string; email: string; role: 'staff' | 'hod' | 'hr' }> = []

    if (memoType === 'deferment') {
      tableName = 'deferment_memo_distributions'
      distributionList.push({
        id: staffId,
        email: staffProfile?.email || '',
        role: 'staff'
      })

      if (hodId) {
        const { data: hodProfile } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .eq('id', hodId)
          .single()

        if (hodProfile?.email) {
          distributionList.push({
            id: hodId,
            email: hodProfile.email,
            role: 'hod'
          })
        }
      }
    } else {
      tableName = 'recall_memo_distributions'
      distributionList.push({
        id: staffId,
        email: staffProfile?.email || '',
        role: 'staff'
      })
    }

    // Create distribution records
    const memoTableName = memoType === 'deferment' ? 'deferment_memos' : 'recall_memos'
    const memoIdField = memoType === 'deferment' ? 'deferment_memo_id' : 'recall_memo_id'

    for (const recipient of distributionList) {
      await supabase.from(tableName).insert({
        [memoIdField]: memoId,
        recipient_id: recipient.id,
        recipient_role: recipient.role,
        received_at: new Date().toISOString()
      })
    }

    // Send email notifications
    await sendMemoEmails({
      memoType,
      staffName: `${staffProfile?.first_name} ${staffProfile?.last_name}`.trim(),
      distributionList,
      memoData
    })

    console.log('[v0] Memo distribution completed successfully')
    return { success: true, distributed_to: distributionList.length }
  } catch (error) {
    console.error('[v0] Error distributing memo:', error)
    throw error
  }
}

interface SendMemoEmailsParams {
  memoType: 'deferment' | 'recall'
  staffName: string
  distributionList: Array<{ id: string; email: string; role: 'staff' | 'hod' | 'hr' }>
  memoData: any
}

export async function sendMemoEmails(params: SendMemoEmailsParams) {
  try {
    const { memoType, staffName, distributionList, memoData } = params

    // Initialize email transporter (using Ethereal for testing, replace with real service)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    })

    const memoTitle = memoType === 'deferment' ? 'Leave Deferment Memo' : 'Leave Recall Memo'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qcc-app.com'

    for (const recipient of distributionList) {
      const memoLink = `${baseUrl}/dashboard/leave-management/${memoType}-memos`
      
      let subject = ''
      let htmlContent = ''

      if (recipient.role === 'staff') {
        subject = `${memoTitle} - ${staffName} Leave Request`
        htmlContent = `
          <h2>Leave ${memoType === 'deferment' ? 'Deferment' : 'Recall'} Approved</h2>
          <p>Dear ${staffName},</p>
          <p>Your leave ${memoType === 'deferment' ? 'deferment' : 'recall'} request has been approved.</p>
          <p>Please find the official memo in your ${memoType === 'deferment' ? 'Deferrments' : 'Recalls'} tab.</p>
          <a href="${memoLink}" style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
            View Memo
          </a>
        `
      } else if (recipient.role === 'hod') {
        subject = `Leave ${memoType === 'deferment' ? 'Deferment' : 'Recall'} Approval - ${staffName}`
        htmlContent = `
          <h2>Staff Leave ${memoType === 'deferment' ? 'Deferment' : 'Recall'} Approved</h2>
          <p>Dear HOD,</p>
          <p>A leave ${memoType === 'deferment' ? 'deferment' : 'recall'} has been approved for ${staffName}.</p>
          <p>A copy of the official memo has been sent for your records.</p>
          <a href="${memoLink}" style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
            View Memo
          </a>
        `
      }

      if (recipient.email && subject) {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || 'noreply@qcc.com',
          to: recipient.email,
          subject,
          html: htmlContent
        })

        // Log email notification
        await supabase.from('email_notifications').insert({
          user_id: recipient.id,
          email_type: `${memoType}_memo`,
          subject,
          body: htmlContent,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
      }
    }

    console.log('[v0] Memo emails sent successfully')
  } catch (error) {
    console.error('[v0] Error sending memo emails:', error)
    // Don't throw - emails are non-blocking
  }
}

export async function markMemoAsAcknowledged(
  memoType: 'deferment' | 'recall',
  memoId: string,
  userId: string
) {
  try {
    const tableName = memoType === 'deferment' ? 'deferment_memo_distributions' : 'recall_memo_distributions'
    const memoIdField = memoType === 'deferment' ? 'deferment_memo_id' : 'recall_memo_id'

    await supabase
      .from(tableName)
      .update({
        acknowledged_at: new Date().toISOString(),
        read_at: new Date().toISOString()
      })
      .eq(memoIdField, memoId)
      .eq('recipient_id', userId)

    console.log('[v0] Memo marked as acknowledged')
  } catch (error) {
    console.error('[v0] Error marking memo as acknowledged:', error)
    throw error
  }
}
