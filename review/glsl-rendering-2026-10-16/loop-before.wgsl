fn mainImage(hy_coord: vec2f) -> vec4f {
  var p = hy_coord;
  var c = vec4f(0.0);

  var i: i32 = 99;
  var j: i32 = 99;
  var total: i32 = 0;
  var visits: i32 = 0;
  {
  i = 0;
  j = 6;
  loop {
  if (!((i < 3))) { break; }
  {
    if ((i == 1)) { continue; }
    visits++;
  }
  continuing {
  i++;
  j -= 2;
  total += i;
  }
  }
  }
  c = vec4f((f32(i) * 0.1), (f32(j) * 0.1), (f32(total) * 0.1), (f32(visits) * 0.1));

  return c;
}