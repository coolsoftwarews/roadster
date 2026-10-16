// The track lateral axis points left from the driver's chase-camera view.
// Follow only part of the lane offset so steering visibly moves the car
// in the pressed direction. A velocity lead can put the camera ahead of
// the car sideways and make that motion appear reversed.
export function chaseCameraPosition(center, forward, lateral, offset, height, speed) {
  const position = center.clone()
    .addScaledVector(forward, -(12 + speed * .018))
    .addScaledVector(lateral, offset * .55);
  position.y = center.y + 8.5 + height * .65;
  return position;
}
