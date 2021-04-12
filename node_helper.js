var NodeHelper = require('node_helper');
var request = require('request');
var moment = require('moment');
var cheerio = require('cheerio');

module.exports = NodeHelper.create({
  start: function () {
    console.info('Starting node helper for: ' + this.name);
  },

  socketNotificationReceived: function(notification, payload) {
     if (notification === 'GET_CURRENT') {
       // https://www.meteoblue.com/en/weather/forecast/current/geneva_switzerland_2660646
       this.getCurrent(payload.currentBase, payload.currentEndpoint, payload.location, payload.params);
     }
  },

  getCurrent: function(currentBase, currentEndpoint, location, params) {

    var url = currentBase + '/' + currentEndpoint + '/' + location;

    var self = this;
    var j = request.jar();
    if (params.units === 'imperial') {
      j.setCookie(request.cookie('temp=FAHRENHEIT'), url);
      j.setCookie(request.cookie('speed=MILES_PER_HOUR'), url);
    } else {
      j.setCookie(request.cookie('temp=CELSIUS'), url);
      j.setCookie(request.cookie('speed=KILOMETER_PER_HOUR'), url);
    }


    request({url: url, jar: j}, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(body);
        //var data = $('table.current_weather_table');
        //console.log(data.html());

        var result = {};

        result.temperature = parseFloat($('span.current_temp').text().replace(/[^\d.-]/g, ''));

        var image = $('span.current_picto img').attr('src').replace(/https:\/\/static.meteoblue.com\/website\/images\/picto\//, '');
        result.icon = image.replace(/.svg/, '');
        result.icon_text = $('span.current_picto > img').attr('title');
        result.windspeed = parseFloat($('div.current_description span:nth-child(2)').text().replace(/[^\d.-]/g, ''));

        var hourly = {};
        $('table.picto > tbody > tr').each(function(index, element) {
          var name = $(element).attr('class');
          hourly[name] = [];
          $('td', element).each(function(ti, te) {
            if (name == 'icons') {
              hourly[name].push($('div.pictoicon > div', te).attr('class').replace('picon', '').trim().replace(/^p/, ''));
            } else {
              hourly[name].push($(te).text());
            }
          });
        });
        result.hourly = hourly;

        self.sendSocketNotification('CURRENT_QUERY_RESULT', {
         url: url,
         result: result
         });

      } else {
        self.sendSocketNotification('CURRENT_QUERY_ERROR', {
         url: url,
         status: response.statusCode,
         error: error
        });
      }
    });
  }

});
