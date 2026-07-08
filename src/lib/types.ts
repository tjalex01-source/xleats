export type LiveStatus = 'live' | 'scheduled' | 'catering' | 'off' | 'closed';
export type AccountPlan = 'free' | 'pro' | 'fleet';
export type DiscountType = 'percent' | 'amount' | 'free_item';
export type OfferType = 'birthday' | 'holiday' | 'new_follower' | 'custom';
export type ContestType = 'count' | 'prediction' | 'first_n' | 'raffle' | 'manual';

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

export type DiscountCode = {
  id: string;
  truck_id: string;
  code: string;
  type: DiscountType;
  value: number | null;
  description: string | null;
  max_redemptions: number | null;
  redemptions: number;
  expires_at: string | null;
  active: boolean;
};

export type Offer = {
  id: string;
  truck_id: string;
  offer_type: OfferType;
  title: string;
  description: string | null;
  radius_miles: number | null;
  trigger_month: number | null;
  trigger_day: number | null;
  trigger_date: string | null;
  active: boolean;
};

export type OfferStat = {
  offer_id: string;
  delivered: number;
  redeemed: number;
};

export type Contest = {
  id: string;
  truck_id: string;
  type: ContestType;
  title: string;
  description: string | null;
  prize: string | null;
  status: string;
  closes_at: string | null;
  answer: string | null;
  winner_limit: number | null;
  winner_note: string | null;
  winner_entry_ids: string[];
};

export type ContestEntry = {
  id: string;
  contest_id: string;
  user_id: string;
  entry_value: string | null;
  created_at: string;
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
