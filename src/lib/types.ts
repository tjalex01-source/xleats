export type LiveStatus = 'live' | 'scheduled' | 'catering' | 'off';
export type AccountPlan = 'free' | 'pro' | 'fleet';

export type Account = {
  id: string;
  owner_id: string;
  name: string;
  plan: AccountPlan;
  suspended: boolean;
  plan_expires_at: string | null;
  comp_note: string | null;
  stripe_customer_id: string | null;
  created_at: string;
};

export type Truck = {
  id: string;
  account_id: string;
  name: string;
  slug: string;
  cuisine: string | null;
  bio: string | null;
  logo_url: string | null;
  banner_url: string | null;
  instagram: string | null;
  service_radius_miles: number;
};

export type MenuItem = {
  id: string;
  truck_id: string;
  name: string;
  description: string | null;
  price: number | null;
  photo_url: string | null;
  category: string | null;
  sort_order: number;
  is_available: boolean;
};

export type LiveSession = {
  id: string;
  truck_id: string;
  date: string;
  status: LiveStatus;
  started_at: string | null;
  expires_at: string | null;
  confirmed_address: string | null;
  catering_note: string | null;
};
