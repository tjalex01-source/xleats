export type LiveStatus = 'live' | 'scheduled' | 'catering' | 'off' | 'closed';
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
  facebook: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  show_phone: boolean;
  show_email: boolean;
  order_url: string | null;
  service_radius_miles: number;
};

export type TruckPhoto = {
  id: string;
  truck_id: string;
  image_url: string;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  price: number | null;
  photo_url: string | null;
  category: string | null;
  sort_order: number;
  is_available: boolean;
  applies_to_all_trucks: boolean;
  is_new: boolean;
  is_catering: boolean;
};

export type MenuPhoto = {
  id: string;
  truck_id: string;
  image_url: string;
  sort_order: number;
};

export type SavedLocation = {
  id: string;
  truck_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
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
