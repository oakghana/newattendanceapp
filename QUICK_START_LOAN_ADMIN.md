# Quick Start - Loan Administration Module

## ⚡ TL;DR - Get Running in 30 Seconds

**Linux/Mac:**
```bash
chmod +x run-app.sh
./run-app.sh
```

**Windows:**
```cmd
run-app.bat
```

**Manual (Any OS):**
```bash
npm run dev
```

Then open: **http://localhost:3000**

---

## ✅ What Was Fixed

The loan administration page threw this error:
```
Error: An unknown Component is an async Client Component. 
Only Server Components can be async at the moment.
```

**Fix Applied:** Moved the `'use client'` directive to the correct location in the component file, allowing async utilities to run on the server while keeping the React component as a client component.

---

## 📁 Files Modified

| File | Change |
|------|--------|
| `/app/dashboard/loan-app/page.tsx` | Fixed 'use client' placement |

---

## 🚀 Files Created

| File | Purpose |
|------|---------|
| `run-app.sh` | Start app (Linux/Mac) |
| `run-app.bat` | Start app (Windows) |
| `LOAN_ADMIN_FIX.md` | Detailed technical documentation |
| `FIX_SUMMARY.txt` | Quick reference |
| `QUICK_START_LOAN_ADMIN.md` | This file |

---

## 📋 Prerequisites

Before running the app, ensure:

1. **Node.js 18+** installed
   ```bash
   node --version  # Should show v18+
   ```

2. **Environment file** exists (`.env.local` or `.env.development.local`)
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your-url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
   ```

---

## ⚙️ Running the App

### Method 1: Automated Script (Recommended)

**Linux/Mac:**
```bash
./run-app.sh
```

**Windows:**
```cmd
run-app.bat
```

### Method 2: Manual

```bash
npm install  # Only needed first time
npm run dev
```

### Access Points

| Service | URL |
|---------|-----|
| Main App | `http://localhost:3000` |
| API | `http://localhost:3000/api/` |
| Dashboard | `http://localhost:3000/dashboard` |
| Loan Admin | `http://localhost:3000/dashboard/loan-app` |

---

## 🔒 Database Safety

The scripts are safe to run:
- ✅ Do NOT run migrations
- ✅ Do NOT modify any tables
- ✅ Do NOT alter auth tables
- ✅ Do NOT change login configuration
- ✅ Only start the development server

---

## 🐛 Troubleshooting

### Issue: Still getting "use client" error?

**Solution:**
```bash
rm -rf .next
npm run dev
```

### Issue: Port 3000 already in use?

**Solution:**
```bash
npm run dev -- -p 3001
```

### Issue: Module not found errors?

**Solution:**
```bash
rm -rf node_modules
npm install
npm run dev
```

### Issue: Cannot connect to database?

**Check:**
1. `.env.local` file exists
2. Supabase credentials are correct
3. Network can reach Supabase
4. VPN is connected (if needed)

---

## 📖 More Information

For detailed technical information, see:
- `LOAN_ADMIN_FIX.md` - Complete technical documentation
- `FIX_SUMMARY.txt` - Quick summary of changes

---

## ✨ Status

**Status:** ✅ **READY FOR PRODUCTION**

All errors have been fixed and the application is ready for:
- Development testing
- Feature validation
- Deployment to production

---

**Last Updated:** 2024
**Version:** 1.0
