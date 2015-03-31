var cheerio = require('cheerio'),
	url = require('url'),
	request = require('request'),
    iconv  = require('iconv-lite'),   
	qs = require('querystring'),
	fs = require('fs'),
	http = require('http');

//TODO: move it to some better caching mechanism
var cacheFilename = __dirname+'/'+'cache.json',
	cacheContent;

var renderResponse = function (data, jsonpCallback) {
console.log(data);
	if (jsonpCallback!==undefined) { //jsonp
		return jsonpCallback+'('+JSON.stringify(data)+');';
	} else {
		return JSON.stringify(data);
	}
};

//gets in format: [{definition: definition, id: id}]
var handleResponse = function (document, word, jsonpCallback, response) {	
	var utf8String = iconv.decode(new Buffer(document), "ISO-8859-2");
	var $ = cheerio.load(utf8String),
		$h1s = $('h1'),
                $allResults = $('p[style="margin-top: .5em; font-size: medium; max-width: 30em; "]'),
		params = {},
		definitions = [],
		results = [];
	
	if ($h1s.length !== 0) {
		console.log('single found');
	        
                  $allResults.each(function () {
                    console.log(this.html());
                    definitions.push(this.html().trim());                  
                  });
		
                /*$tds = $definition.find('table');
		if ($tds.length === 1) { //multiple definitions
			$tds.find('tr').each(function () {
				definitions.push(this.find('td').eq(1).html().trim());
			});
		} else {
			$definition.find('br').eq(0).remove();
			definitions.push($definition.html().trim());
		}
	*/	
		//save
		results.push({
			'word': $($h1s[0]).html(),
			'definition': definitions,
			'id': word 
		}); 
	} /* else if ($natLinks.length !== 0) {
		console.log('ambigious found');
		
		$natLinks.each(function () {
			var href = this.attr('href'),
				$definition = this.parent(),
				$word = $definition.find('b').eq(0),
				params = {};
			
			//get id
			if (href !== undefined) {
				href = url.parse(href);
				params = qs.decode(href.query);
			}
			
			//remove link from definition
			this.remove();
			$word.remove();
			
			//save
			results.push({
				'word': $word.html().trim(),
				'definition': [$definition.html().trim()],
				'id': params[idAttribute]
			});
		});
	} */ else {
		console.log('not found');
	}
	
	//save to cache
	cacheContent = (cacheContent !== undefined)?cacheContent:{};
	cacheContent[word] = results;
	
	/*fs.writeFile(cacheFilename, JSON.stringify(cacheContent), function (error) {
		if (error) {
			console.error('Could not write to cache file:', cacheFilename);
			//ignore
		}
	});*/
	
	if (results.length !== 0 ) {
		console.log('results from', 'service');
		response.statusCode = 200;
	} else {
		response.statusCode = 404;
	}
	
	response.write(renderResponse({'results': results}, jsonpCallback));
	response.end();
};

var searchByWord = function (word, jsonpCallback, response) {
	var serviceUrl = 'http://sjp.pl/' + word;
	
	request.post({
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		url: serviceUrl,
		encoding: null
	}, function(error, serviceResponse, body) {
		if(!error && serviceResponse.statusCode == 200){
			handleResponse.call(this, body, word, jsonpCallback, response);
		} else {
			console.error('Error while getting: ', word, 'status:', serviceResponse.statusCode);
			response.statusCode = 503;
			response.write(renderResponse({'error': 'Service not available'}, jsonpCallback));
			response.end();
		}
	});
};

//finds in format: [{definition: definition, id: id}]
var getDefinition = function (word, jsonpCallback, response) {
	console.log('Looking for', word);
	if (word !== '' && word.split(/\s+/).length <= 4) { //no more than 4 words
		fs.readFile(cacheFilename, function (error, data) {
			var results;
			
			if (!error) {
				try {
					cacheContent = JSON.parse(data.toString());
				} catch (e) {
					console.error('Could not parse cache file:', cacheFilename);
					//ignore
				}
			} else {
				console.error('Could not read cache file:', cacheFilename);
				//ignore
			}
			
			results = cacheContent[word];
			if (cacheContent !== undefined &&  results!== undefined) {
				console.log('results from', 'cache');
				
				response.statusCode = (results.length > 0)?200:404;
				response.write(renderResponse({'results': results}, jsonpCallback));
				response.end();
			} else {
				searchByWord.call(this, word, jsonpCallback, response);
			}
		});
	} else {
		response.statusCode = 400;
		response.end('{"error": "Parameter \''+wordAttribute+'\' has too many words."}');
	}
};


//http server
http.createServer(function (request, response) {
	var params = qs.decode(url.parse(request.url).query),
		wordAttribute = 'word';
	
	if (params['callback'] !== undefined) {
		response.setHeader("Content-Type", "application/javascript");
	} else {
		response.setHeader("Content-Type", "application/json");
	}
	
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, HEAD");
	response.setHeader("Access-Control-Allow-Headers", "X-Requested-With");
	response.setHeader("Access-Control-Max-Age", 1728000);
	
	if (params[wordAttribute] === undefined) {
		response.statusCode = 400;
		response.end('{"error": "Parameter \''+wordAttribute+'\' is required."}');
	} else {
		getDefinition.call(this, params[wordAttribute], params['callback'], response);
	}
}).listen(9616);
