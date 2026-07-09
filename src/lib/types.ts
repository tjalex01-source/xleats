export type LiveStatus = 'live' | 'scheduled' | 'catering' | 'off' | 'closed';
export type AccountPlan = 'free' | 'pro' | 'fleet';
export type DiscountType = 'percent' | 'amount' | 'free_item';
export type OfferType = 'birthday' | 'holiday' | 'new_follower' | 'custom';
export type ContestType = 'count' | 'prediction' | 'first_n' | 'raffle' | 'manual' | 'milestone';

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
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
};

export type Special = {
  id: string;
  truck_id: string;
  menu_item_id: string;
  special_price: number;
  advertise_discount: boolean;
  recurring: boolean;
  days_of_week: number[];
  special_date: string | null;
  active: boolean;
};

export type SpecialTap = {
  special_id: string;
  tap_date: string;
  count: number;
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
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  blast_id: string | null;
  created_at: string;
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
  blast_id: string | null;
};

export type PromoBlast = {
  id: string;
  account_id: string;
  kind: 'discount_code' | 'offer' | 'contest';
  message: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
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
  target_count: number | null;
  tap_count: number;
  winner_user_id: string | null;
  blast_id: string | null;
  created_at: string;
};

export type ContestEntry = {
  id: string;
  contest_id: string;
  user_id: string;
  entry_value: string | null;
  redemption_code: string | null;
  redeemed_at: string | null;
  created_at: string;
};

export type ContestWinnerName = {
  entry_id: string;
  first_name: string;
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

export type TruckStats = {
  followers: number;
  new_followers_30d: number;
  go_lives_30d: number;
  posts_30d: number;
  discount_redemptions: number;
  offers_delivered: number;
  offers_redeemed: number;
  special_taps_30d: number;
  active_discount_codes: number;
  active_offers: number;
  open_contests: number;
};

export type WeekActivity = {
  week_start: string;
  new_followers: number;
  go_lives: number;
  posts: number;
};
