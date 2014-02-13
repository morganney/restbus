var restbus = require('../index');

restbus.listen(function(port) {
  console.log('restbus listening on port ' + port);
});

setTimeout(function() {
 restbus.close(function() {
   console.log('restbus went to bed for the night');
 });
}, 10000);

/*
(function recurse() {

  if(restbus.isListening()) {
    restbus.close(function() {console.log('restbus is not listening.')});
  } else {
    restbus.listen('3535', function() {console.log('restbus is now listening on port 3535.')}, true);
  }

  setTimeout(recurse,10000);

}());
*/