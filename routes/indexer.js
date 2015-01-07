var express = require('express');
var router = express.Router({
	strict: true,
	mergeParams: true
});
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var config = require("../config");
var SolrQueryParser = require("../middleware/SolrQueryParser");
var RQLQueryParser = require("../middleware/RQLQueryParser");
var authMiddleware = require("../middleware/auth");
var solrjs = require("solrjs");
var media = require("../middleware/media");
var httpParams = require("../middleware/http-params");
var SOLR_URL = config.get("solr").url;
var bodyParser = require("body-parser");
var rql = require("solrjs/rql");
var clarinet = require("clarinet");
var Queue = require("file-queue").Queue;
console.log("Queue Directory: ", config.get("queueDirectory"));

var queue = new Queue(config.get("queueDirectory"), function(err) {
	if (err) {
		console.log("error: ", err);
		return;
	}
	console.log("Created Queue.");
});

router.use(httpParams);

router.use(authMiddleware);

router.use(function(req, res, next) {
	console.log("req.path", req.path);
	console.log("req content-type", req.get("content-type"));
	console.log("accept", req.get("accept"));
	console.log("req.url", req.url);
	console.log('req.path', req.path);
	console.log('req.params:', JSON.stringify(req.params));
	next();
});

router.post("/", [
	//	bodyParser.raw({type: "application/json",limit: 90000000}),
	function(req, res, next) {
		var stack = [];
		var new_thing = false,
			previous = '',
			buffer = {}

		//console.log("Create JSONStream Obj");
		var stream = clarinet.createStream()

		stream.on('openobject', function(name) {
			if (new_thing) {
				//console.log(JSON.stringify(buffer, null, 2));
				buffer = {};
				new_thing = false;
			}
			previous = name;
			stack.push(name);
			//console.log('=== {', name, buffer);
		});

		stream.on('closeobject', function() {
			stack.pop();
			//console.log("Obj: ", typeof buffer, JSON.stringify(buffer));
			queue.push(buffer, function(err) {
				if (err) throw err;
			});
		});

		stream.on('key', function(name) {
			previous = name;
			stack.pop();
			stack.push(name);
		});

		stream.on('value', function(value) {
			if (previous === 'event') {
				value = JSON.parse(value);
			}
			var expected = stack.length - 1;
			stack.reduce(function(ac, x, i) {
				if (i === expected) {
					ac[x] = value;
				}
				ac[x] = ac[x] || {};
				return ac[x];
			}, buffer);
			//  console.log('=== v', value, buffer);
		});

		stream.on('end', function() {
			 res.write("INDEX OBJECTS ACCEPTED");
       res.end()
		});


		req.pipe(stream);
	}
]);

module.exports = router;