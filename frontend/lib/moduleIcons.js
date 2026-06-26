'use client';

import {
  Boxes, Briefcase, Users, UserCog, Building2, Megaphone, Award, Activity,
  FileText, Package, Truck, Ticket, Calendar, DollarSign, Target, Layers,
  Folder, Star, ShoppingCart, Home, Wrench, BookOpen, MapPin, Phone,
} from 'lucide-react';

// Curated set shown in the module icon picker.
export const ICON_SET = [
  { name: 'Boxes', Icon: Boxes },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Package', Icon: Package },
  { name: 'Layers', Icon: Layers },
  { name: 'Folder', Icon: Folder },
  { name: 'FileText', Icon: FileText },
  { name: 'Users', Icon: Users },
  { name: 'Building2', Icon: Building2 },
  { name: 'Target', Icon: Target },
  { name: 'Award', Icon: Award },
  { name: 'Star', Icon: Star },
  { name: 'Ticket', Icon: Ticket },
  { name: 'Truck', Icon: Truck },
  { name: 'ShoppingCart', Icon: ShoppingCart },
  { name: 'DollarSign', Icon: DollarSign },
  { name: 'Calendar', Icon: Calendar },
  { name: 'Home', Icon: Home },
  { name: 'Wrench', Icon: Wrench },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'MapPin', Icon: MapPin },
];

// Broader lookup incl. the built-in module icons (UserCog/Activity/Phone…).
const ICON_MAP = {
  ...Object.fromEntries(ICON_SET.map((i) => [i.name, i.Icon])),
  UserCog, Megaphone, Activity, Phone,
};

export function iconByName(name) {
  return ICON_MAP[name] || Boxes;
}
