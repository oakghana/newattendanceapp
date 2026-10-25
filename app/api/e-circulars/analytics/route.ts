import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
const ROLES = new Set(["admin", "administrator", "department_head", "regional_manager", "regional_hr_office", "regional_hr_officer", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director"])
export async function GET(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const admin = await createAdminClient(); const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle(); if (!ROLES.has(String(profile?.role))) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const id = new URL(request.url).searchParams.get("circularId")
  const PAGE = 1000
  const reads: any[] = []
  for (let from = 0; ; from += PAGE) {
    let query = admin.from("e_circular_reads").select("circular_id,user_id,opened_at,last_opened_at,open_count,download_count,last_downloaded_at,role,location_id").order("last_opened_at", { ascending: false }).range(from, from + PAGE - 1)
    if (id) query = query.eq("circular_id", id)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    reads.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  const readsByCircular = new Map<string, any[]>()
  for (const read of reads) {
    const list = readsByCircular.get(read.circular_id)
    if (list) list.push(read)
    else readsByCircular.set(read.circular_id, [read])
  }
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
  // PostgREST caps each response at 1000 rows, which under-counted today's check-ins.
  const fetchTodayCheckInUserIds = async () => {
    const ids = new Set<string>()
    for (let from = 0; ; from += PAGE) {
      const { data } = await admin.from("attendance_records").select("user_id").gte("check_in_time", todayStart).lt("check_in_time", tomorrowStart).order("id", { ascending: true }).range(from, from + PAGE - 1)
      for (const record of data || []) if (record.user_id) ids.add(record.user_id)
      if (!data || data.length < PAGE) break
    }
    return ids
  }
  const userIds = Array.from(new Set(reads.map((read: any) => read.user_id).filter(Boolean)))
  const locationIds = Array.from(new Set(reads.map((read: any) => read.location_id).filter(Boolean)))
  // Chunk the id list: thousands of ids in one .in() overflow the request URL and silently return nothing.
  const fetchProfiles = async () => {
    const chunks: string[][] = []
    for (let i = 0; i < userIds.length; i += 150) chunks.push(userIds.slice(i, i + 150))
    const results = await Promise.all(chunks.map((ids) => admin.from("user_profiles").select("id,position,role,assigned_location_id").in("id", ids)))
    return results.flatMap((result) => result.data || [])
  }
  const [{ count: totalStaff }, { data: circulars }, checkedInIds, profiles, { data: locations }] = await Promise.all([
    admin.from("user_profiles").select("id", { count: "exact", head: true }),
    admin.from("e_circulars").select("id,title,published_at").eq("is_published", true),
    fetchTodayCheckInUserIds(),
    fetchProfiles(),
    locationIds.length ? admin.from("geofence_locations").select("id,name").in("id", locationIds) : Promise.resolve({ data: [] }),
  ])
  const checkedInStaff = checkedInIds.size
  const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))
  const locationMap = new Map((locations || []).map((location: any) => [location.id, location.name]))
  const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((result, value) => { const key = value || "Not specified"; result[key] = (result[key] || 0) + 1; return result }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  const enrichedReads = reads.map((read: any) => {
    const profile = profileMap.get(read.user_id)
    return { ...read, location: locationMap.get(read.location_id) || "Not specified", rank: profile?.position || "Not specified", role: profile?.role || read.role || "Not specified" }
  })
  const staffTotal = totalStaff || 0
  const circularPerformance = (circulars || []).map((circular: any) => {
    const circularReads = readsByCircular.get(circular.id) || []
    const readers = new Set(circularReads.map((read: any) => read.user_id).filter(Boolean)).size
    const downloads = circularReads.reduce((sum: number, read: any) => sum + Number(read.download_count || 0), 0)
    const downloaders = new Set(circularReads.filter((read: any) => Number(read.download_count || 0) > 0).map((read: any) => read.user_id).filter(Boolean)).size
    return { title: circular.title, readers, readingRate: staffTotal ? Math.round((readers / staffTotal) * 100) : 0, downloads, downloaders, publishedAt: circular.published_at }
  }).sort((a, b) => b.downloads - a.downloads || b.readers - a.readers)
  const totalDownloads = reads.reduce((sum: number, read: any) => sum + Number(read.download_count || 0), 0)
  const uniqueDownloaders = new Set(reads.filter((read: any) => Number(read.download_count || 0) > 0).map((read: any) => read.user_id).filter(Boolean)).size
  return NextResponse.json({ reads: enrichedReads, summary: { totalReads: reads.length, uniqueReaders: userIds.length, totalStaff: staffTotal, readingRate: staffTotal ? Math.round((userIds.length / staffTotal) * 100) : 0, checkedInReadingRate: checkedInStaff ? Math.round((userIds.length / checkedInStaff) * 100) : 0, unreadReaders: Math.max(staffTotal - userIds.length, 0), checkedInStaff, averageOpens: userIds.length ? Math.round((reads.reduce((sum: number, read: any) => sum + Number(read.open_count || 1), 0) / userIds.length) * 10) / 10 : 0, totalDownloads, uniqueDownloaders, downloadRate: userIds.length ? Math.round((uniqueDownloaders / userIds.length) * 100) : 0, byLocation: countBy(enrichedReads.map((read: any) => read.location)), byRank: countBy(enrichedReads.map((read: any) => read.rank)), circularPerformance } })
}
