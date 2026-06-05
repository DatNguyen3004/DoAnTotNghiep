export const BASE_URL = '/api';

export const CLASSES = [
    { id: 'vehicle.car',        name: 'Xe con',       icon: 'fa-car',              color: '#3B82F6' },
    { id: 'vehicle.truck',      name: 'Xe tải',       icon: 'fa-truck',            color: '#F59E0B' },
    { id: 'vehicle.bus',        name: 'Xe buýt',      icon: 'fa-bus',              color: '#8B5CF6' },
    { id: 'vehicle.motorcycle', name: 'Xe máy',       icon: 'fa-motorcycle',       color: '#EC4899' },
    { id: 'vehicle.bicycle',    name: 'Xe đạp',       icon: 'fa-bicycle',          color: '#F97316' },
    { id: 'human.pedestrian',   name: 'Người đi bộ',  icon: 'fa-person-walking',   color: '#10B981' },
];

export const CLASS_MAP = {};
CLASSES.forEach(c => CLASS_MAP[c.id] = c);

export const CAM_LABELS = {
    CAM_FRONT: 'Cam trước',
    CAM_FRONT_LEFT: 'Cam trái trước',
    CAM_FRONT_RIGHT: 'Cam phải trước',
    CAM_BACK: 'Cam sau',
    CAM_BACK_LEFT: 'Cam trái sau',
    CAM_BACK_RIGHT: 'Cam phải sau',
};
