Module.register('MMM-meteoblue', {
    // Default module config.
    defaults: {
        // Get the coordinates by searching for a location in https://www.meteoblue.com
        lat: 0,
        lon: 0,
        asl: 0,
        tz: 'Europe/Zurich',
        // Get an API key
        apiKey: '',

        roundTemp: false,
        daysToShow: 7,
        units: config.units,
        timeFormat: config.timeFormat,
        initialLoadDelay: 0, // 0 seconds delay
        retryDelay: 2500,
        updateInterval: 60 * 60 * 1000, // every 60 minutes
        animationSpeed: 1000,

        apiBase: 'https://my.meteoblue.com',
        forecastEndpoint: 'packages/basic-day',
    },

    getScripts: function() {
        return [
            'moment.js',
            this.file('node_modules/jquery/dist/jquery.slim.min.js'),
            this.file('node_modules/underscore/underscore-min.js'),
        ];
    },

    getStyles: function() {
        return [this.file('css/MMM-meteoblue.css')];
    },

    getTranslations: function() {
        return {
            en: 'translations/en.json',
            es: 'translations/es.json',
        }
    },

    start: function() {
        Log.info('Starting module: ' + this.name);

        // Set locale
        moment.locale(config.language);

        this.forecast = [];
        this.loaded = false;
        this.scheduleUpdate(this.config.initialLoadDelay);
    },

    // Override dom generator.
    getDom: function() {
        var wrapper = document.createElement("div");

        if (this.config.apiKey === "") {
            wrapper.innerHTML = "Please set the correct Meteoblue <i>apiKey</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.lat === 0 || this.config.lon === 0 || this.config.asl === 0) {
            wrapper.innerHTML = "Please set the correct Meteoblue <i>lat</i>, <i>lon</i> and <i>asl</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = this.translate('LOADING');
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        var template = `
        <div class="large light">
          <img src="/modules/MMM-meteoblue/img/<%- forecast.data[0].icon %>" height="50px" class="pictocode">
          <span class="temp"><%- forecast.data[0].tempMean %>&deg;</span>
        </div>
        <%
        var tempMin = _.min(_.pluck(forecast.data, 'tempMin'));
        var tempMax = _.max(_.pluck(forecast.data, 'tempMax'));
        var total = tempMax - tempMin;
        var interval = 100 / total;
        %>
        <table class="forecast">
          <% _.each(forecast.data, function(f){ %>
          <tr class="forecast-row">
            <td><%- f.day.format("ddd") %></td>
            <td><img src="/modules/MMM-meteoblue/img/<%- f.icon %>" height="50px" class="pictocode"></td>
            <td><div class="forecast-bar">
              <span style="width:<%- Math.round(interval * (f.tempMin - tempMin)) %>%;"></span>
              <span class="temp min-temp"><%- f.tempMin %>&deg;</span>
              <span style="width:<%- Math.round(interval * (f.tempMax - f.tempMin)) %>%;" class="bar">&nbsp;</span>
              <span class="temp max-temp"><%- f.tempMax %>&deg;</span>
              <span style="width:<%- Math.round(interval * (tempMax - f.tempMax)) %>%;"></span>
            </div></td>
          </tr>
          <% }); %>
        </table>
        <div class="xsmall dimmed"><%- translate('last updated on') %> <%- forecast.metadata.updateTime.format('llll') %></div>
        `;

        var t = _.template(template);
        var $div = $(
          t({
             name: this.name, // Need this to make translations work
             translate: this.translate,
             config: this.config,
             forecast: this.forecast,
           })
        );

        return $div.wrapAll('<div>').parent()[0];
    },

    getParams: function() {
        var params = "?";
        params += "apikey=" + this.config.apiKey;
        params += "&lat=" + this.config.lat;
        params += "&lon=" + this.config.lon;
        params += "&asl=" + this.config.asl;

        if (this.config.units === 'imperial') {
            params += "&temperature=F";
            params += "&windspeed=mph";
            params += "&precipitationamount=inch";
        } else {
            params += "&temperature=C";
            params += "&windspeed=kmh";
            params += "&precipitationamount=mm";
        }

        return params;
    },

    processWeather: function(data) {
        Log.info('uncooked data', data);

        /* Go from this:
          { 'temperature_max': [10, 11, 12, ...], ... }
         to this:
          [{'temperature_max': 10}, {'temperature_max': 11}, {'temperature_max': 12}, ...]
        */
        var keys = _.keys(data.data_day);
        var values = _.map(keys, function(k) { return data.data_day[k]; });
        var valueSlices = _.zip.apply(_, values);
        var day = _.map(valueSlices, _.partial(_.object, keys));
        Log.info('cooked data', day);

        this.forecast = {};
        this.forecast.data = [];
        for (var i = 0; i < Math.min(this.config.daysToShow, day.length); i++) {
            var f = day[i];
            this.forecast.data.push({
                day: moment.utc(f.time).local(),
                icon: ('00'+f.pictocode).slice(-2) + '_iday_monochrome.svg',
                tempMax: this.roundValue(f.temperature_max),
                tempMean: this.roundValue(f.temperature_mean),
                tempMin: this.roundValue(f.temperature_min),
                feltTempMax: this.roundValue(f.felttemperature_max),
                feltTempMin: this.roundValue(f.felttemperature_min),
                precipitation: f.precipitation,
                precipitation_hours: f.precipitation_hours,
                precipitation_probability: f.precipitation_probability,
                predictability: f.predictability,
                humidityMax: f.relativehumidity_max,
                humidityMean: f.relativehumidity_mean,
                humidityMin: f.relativehumidity_min,
                uvindex: f.uvindex,
                windDirection: f.winddirection,
                windSpeedMax: f.windspeed_max,
                windSpeedMean: f.windspeed_mean,
                windSpeedMin: f.windspeed_min,
            });
        }

        this.forecast.metadata = {
            updateTime: moment.utc(data.metadata.modelrun_updatetime_utc).local(),
            units: data.units,
        };

        Log.info('forecast data', this.forecast);
        this.loaded = true;
        this.updateDom(this.config.animationSpeed);
    },

    updateWeather: function() {
        var url = this.config.apiBase + '/' + this.config.forecastEndpoint + this.getParams();
        var self = this;
        var retry = true;

        var weatherRequest = new XMLHttpRequest();
        weatherRequest.open("GET", url, true);
        weatherRequest.onreadystatechange = function() {
            if (this.readyState === 4) {
                if (this.status === 200) {
                    self.processWeather(JSON.parse(this.response));
                } else if (this.status === 401) {
                    self.config.appid = "";
                    self.updateDom(self.config.animationSpeed);

                    Log.error(self.name + ": Incorrect APPID.");
                    retry = false;
                } else {
                    Log.error(self.name + ": Could not load weather.");
                }

                if (retry) {
                    self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
                }
            }
        };
        weatherRequest.send();
    },

    scheduleUpdate: function(delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        var self = this;
        setTimeout(function() {
            self.updateWeather();
        }, nextLoad);
    },

    /* function(temperature)
	 * Rounds a temperature to 1 decimal or integer (depending on config.roundTemp).
	 *
	 * argument temperature number - Temperature.
	 *
	 * return number - Rounded Temperature.
	 */
	roundValue: function(temperature) {
		var decimals = this.config.roundTemp ? 0 : 1;
		return typeof temperature === 'number'? Number(parseFloat(temperature).toFixed(decimals)) : null;
	}
});
