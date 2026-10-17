"use strict";
(function () {
  if (typeof PIECE_VALUE !== "undefined" && typeof PST_DELTA === "object") {
    for (var i = 0; i < PST_DELTA.length; i++) {
      var row = PST_DELTA[i];
      PIECE_VALUE[row[0]][row[1]] += row[2];
    }
  }
  if (typeof BOOK_DAT === "undefined" || typeof BOOK_TRAIN !== "object") return;
  var map = Object.create(null);
  for (var j = 0; j < BOOK_DAT.length; j++) {
    var e = BOOK_DAT[j];
    if (e) map[e[0] + ":" + e[1]] = e;
  }
  for (var k = 0; k < BOOK_TRAIN.length; k++) {
    var x = BOOK_TRAIN[k];
    var key = x[0] + ":" + x[1];
    if (map[key]) map[key][2] += x[2];
    else {
      BOOK_DAT.push(x);
      map[key] = x;
    }
  }
  BOOK_DAT.sort(function (a, b) {
    if (!a) return 1;
    if (!b) return -1;
    return a[0] - b[0] || a[1] - b[1];
  });
})();
