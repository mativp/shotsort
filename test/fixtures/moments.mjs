export const MILLISECONDS_PER_SECOND = 1000;

export const secondsSince1970For = (cameraClock) => {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second) / MILLISECONDS_PER_SECOND;
};
