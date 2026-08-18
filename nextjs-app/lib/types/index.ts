export type AuctionStatus = 'live' | 'scheduled' | 'closed' | 'active' | 'draft';

export interface Ad {
  id: string;
  title_pt: string | null;
  title_es?: string | null;
  price: number | null;
  currency: string | null;
  price_unit_pt?: string | null;
  images: string[] | null;
  category_id: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  created_at: string;
  featured: boolean;
  user_id?: string;
  description?: string | null;
  status?: string | null;
  views_count?: number | null;
}

export interface UserProfile {
  id: string;
  name: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  phone_whatsapp?: string | null;
  created_at?: string;
  verified?: boolean;
}

export interface SellerStats {
  total_reviews: number;
  avg_rating: number;
  verified?: boolean;
}

export interface PlatformStats {
  total_ads: number;
  total_sellers: number;
  total_countries: number;
  total_cities: number;
  total_bovinos?: number;
  total_machines?: number;
  total_auctions?: number;
}

export interface AuctionEvent {
  id: string;
  title: string;
  date: string;
  status: AuctionStatus;
  youtube: string | null;
  cover: string | null;
  catalog: string | null;
  description?: string | null;
  location?: string | null;
}

export interface AuctionLot {
  id: string;
  auction_id: string;
  lot_number?: number | null;
  title: string;
  description?: string | null;
  image?: string | null;
  min_bid?: number | null;
  current_bid?: number | null;
  status?: string | null;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  ad_id?: string | null;
  content: string;
  created_at: string;
  read?: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  plan?: string | null;
}
