'use strict';

function nextDragPosition(bounds, startCursor, cursor) {
  return {
    x: bounds.x + cursor.x - startCursor.x,
    y: bounds.y + cursor.y - startCursor.y
  };
}

module.exports = { nextDragPosition };
