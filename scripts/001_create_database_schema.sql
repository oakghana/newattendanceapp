-- QCC Electronic Attendance System Database Schema
-- Create core tables with proper relationships and security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create regions table (for Ghana regions)
CREATE TABLE IF NOT EXISTS public.regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    country VARCHAR(50) DEFAULT 'Ghana',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create districts table
CREATE TABLE IF NOT EXISTS public.districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL,
    region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, region_id)
);

-- Create geofence locations table
CREATE TABLE IF NOT EXISTS public.geofence_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER DEFAULT 20,
    district_id UUID REFERENCES public.districts(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    department_id UUID REFERENCES public.departments(id),
    position VARCHAR(100),
    role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('admin', 'department_head', 'staff')),
    hire_date DATE,
    is_active BOOLEAN DEFAULT true,
    profile_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create device sessions table
CREATE TABLE IF NOT EXISTS public.device_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(100),
    device_type VARCHAR(50),
    browser_info TEXT,
    ip_address INET,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create attendance records table
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    check_in_location_id UUID REFERENCES public.geofence_locations(id),
    check_out_location_id UUID REFERENCES public.geofence_locations(id),
    check_in_latitude DECIMAL(10, 8),
    check_in_longitude DECIMAL(11, 8),
    check_out_latitude DECIMAL(10, 8),
    check_out_longitude DECIMAL(11, 8),
    work_hours DECIMAL(4, 2),
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent', 'half_day')),
    notes TEXT,
    device_session_id UUID REFERENCES public.device_sessions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create QR events table
CREATE TABLE IF NOT EXISTS public.qr_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location_id UUID REFERENCES public.geofence_locations(id),
    qr_code_data TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create QR event scans table
CREATE TABLE IF NOT EXISTS public.qr_event_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_event_id UUID NOT NULL REFERENCES public.qr_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    device_session_id UUID REFERENCES public.device_sessions(id),
    UNIQUE(qr_event_id, user_id)
);

-- Create overtime records table
CREATE TABLE IF NOT EXISTS public.overtime_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    hours DECIMAL(4, 2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create email notifications table
CREATE TABLE IF NOT EXISTS public.email_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    email_type VARCHAR(50) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_employee_id ON public.user_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON public.user_profiles(department_id);
-- Avoid non-immutable functional indexes on timestamptz; keep range queries fast with plain indexes.
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_check_in_time ON public.attendance_records(user_id, check_in_time);
CREATE INDEX IF NOT EXISTS idx_attendance_records_check_in_time ON public.attendance_records(check_in_time);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON public.device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_event_scans_event ON public.qr_event_scans(qr_event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON public.audit_logs(user_id, action);

-- Enable Row Level Security on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_event_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_profiles
CREATE POLICY "Users can view their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Create RLS policies for attendance_records
CREATE POLICY "Users can view their own attendance" ON public.attendance_records
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own attendance" ON public.attendance_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attendance" ON public.attendance_records
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all attendance" ON public.attendance_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'department_head')
        )
    );

-- Create RLS policies for device_sessions
CREATE POLICY "Users can manage their own device sessions" ON public.device_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Create RLS policies for other tables (read-only for most users)
CREATE POLICY "All users can view departments" ON public.departments
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can view regions" ON public.regions
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can view districts" ON public.districts
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can view geofence locations" ON public.geofence_locations
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Create function to automatically update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_geofence_locations_updated_at BEFORE UPDATE ON public.geofence_locations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Try to create user profile, but don't fail if it errors
    BEGIN
        INSERT INTO public.user_profiles (
            id,
            employee_id,
            first_name,
            last_name,
            email,
            department_id,
            position,
            role,
            is_active
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'employee_id', 'EMP' || EXTRACT(EPOCH FROM NOW())::TEXT),
            COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'),
            COALESCE(NEW.raw_user_meta_data ->> 'last_name', 'Name'),
            NEW.email,
            CASE 
                WHEN NEW.raw_user_meta_data ->> 'department_id' IS NOT NULL 
                AND NEW.raw_user_meta_data ->> 'department_id' != '' 
                THEN (NEW.raw_user_meta_data ->> 'department_id')::UUID
                ELSE NULL
            END,
            NEW.raw_user_meta_data ->> 'position',
            COALESCE(NEW.raw_user_meta_data ->> 'role', 'staff'),
            COALESCE((NEW.raw_user_meta_data ->> 'is_active')::BOOLEAN, false)
        )
        ON CONFLICT (id) DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            email = EXCLUDED.email,
            department_id = EXCLUDED.department_id,
            position = EXCLUDED.position,
            role = EXCLUDED.role,
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
        
        -- Log successful user creation
        INSERT INTO public.audit_logs (
            user_id,
            action,
            table_name,
            new_values,
            created_at
        )
        VALUES (
            NEW.id,
            'user_signup_success',
            'user_profiles',
            jsonb_build_object(
                'email', NEW.email,
                'role', COALESCE(NEW.raw_user_meta_data ->> 'role', 'staff'),
                'signup_method', 'email'
            ),
            NOW()
        );
        
    EXCEPTION
        WHEN OTHERS THEN
            -- Log the error but don't fail the auth signup
            BEGIN
                INSERT INTO public.audit_logs (
                    action,
                    table_name,
                    new_values,
                    created_at
                )
                VALUES (
                    'user_signup_error',
                    'user_profiles',
                    jsonb_build_object(
                        'error', SQLERRM,
                        'sqlstate', SQLSTATE,
                        'email', NEW.email,
                        'metadata', NEW.raw_user_meta_data
                    ),
                    NOW()
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- If even logging fails, just continue
                    NULL;
            END;
    END;
    
    -- Always return NEW to allow auth signup to succeed
    RETURN NEW;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
