/**
* Homebridge plugin to reading DHT22 Sensor on a Raspberry PI.  Assumes DHT22
* is connected to GPIO 4 by default.
*
* Uses pigpio library to access gpio pin, and a custom program dht22 read the sensor!!
* See http://abyz.me.uk/rpi/pigpio/examples.html
*
* Path to this file: /usr/local/lib/node_modules/homebridge-dht/index.js
*
*  "accessories": [{
*      "accessory": "Dht",
*      "name": "cputemp",
*      "service": "Temperature"
*  }, {
*      "accessory": "Dht",
*      "name": "Temp/Humidity Sensor",
*      "service": "dht22"
*  }, {        // For testing
*      "accessory": "Dht",
*      "name": "Test-DHT",
*      "service": "dht22",
*      "dhtExec": "Code/homebridge-dht/test/dht22"
*  }]
*  
*   or Multiple
*  
*  "accessories": [{
*      "accessory": "Dht",
*      "name": "cputemp",
*      "service": "Temperature"
*  }, {
*      "accessory": "Dht",
*      "name": "Temp/Humidity Sensor - Indoor",
*      "service": "dht22",
*      "gpio": "4",
*     "refresh": "60"
*  }, {
*      "accessory": "Dht",
*      "name": "Temp/Humidity Sensor - Outdoor",
*      "service": "dht22",
*      "gpio": "5",
*     "refresh": "45"
*  }]
*/

var Service;
var Characteristic;
var exec = require('child_process').execFile;
var cputemp, dhtExec;
var os = require("os");
var hostname = os.hostname();

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-dht", "Dht", DhtAccessory);
}


function DhtAccessory(log, config) {
  // The log object is a wrapper for console.log that puts log messages to the outup log. Use this.log('message_to_log')
  this.log = log;
  this.log("Adding Accessory");
  this.config = config;
  this.name = config.name;
  this.name_temperature = config.name_temperature || config.name;
  this.name_humidity = config.name_humidity || config.name;
  this.service = config.service || "dht22";
  this.gpio = config.gpio || "4";
  this.refresh = config.refresh || "60"; // Every minute; used in setInterval()

  dhtExec = config.dhtExec || "dht22";
  cputemp = config.cputemp || "cputemp";

}

DhtAccessory.prototype = {
  // function to get temperature and humidity from DHT sensor
  getDHTTemperature: function(callback) {
    // get DHT temperature and humidity; dhtExec (dhtExec = dht22) is a shell command on raspberry pi -> requires pigpio DHTXXD (http://abyz.me.uk/rpi/pigpio/examples.html)
    exec(dhtExec, ['-g', this.gpio], function(error, responseBody, stderr) {
      if (error !== null) {
        this.log('dhtExec function failed: ' + error);
        callback(error);
      } else {
        // dht22 output format:
        // 0 24.8 C 50.3 %
        var result = responseBody.toString().split(/[ \t]+/);
        var temperature = parseFloat(result[1]);
        var humidity = parseFloat(result[3]);

        this.log("DHT Status: %s, Temperature: %s, Humidity: %s", result[0], temperature, humidity);

        // check status return code from DHTXXD
        //
        // DHTXXD returns three values.  A status, the temperature, and the
        // humidity.  The status is one of the following.  0 (good)
        // indicates a successful read.  The other values indicate a read failure
        // and the last good read of temperature and humidity will be returned.
        // #DHT_GOOD         0
        // #DHT_BAD_CHECKSUM 1
        // #DHT_BAD_DATA     2
        // #DHT_TIMEOUT      3
        
        var err;
        if (parseInt(result[0]) !== 0) {
          if (parseInt(result[0]) == 3) {
            this.log.error("Error: dht22 read timeout: status code: %s", result[0]);
          } else {
            this.log.error("Error: dht22 read failed with status code: %s", result[0]);
          }
          err = new Error("dht22 read failed");
        }
        callback(err, temperature, humidity);
      }
    }.bind(this));
  },

  // function to get cpu temperature
  getTemperature: function(callback) {
    // get CPU temperature; cputemp is a shell command on raspberry pi -> requires pigpio DHTXXD (http://abyz.me.uk/rpi/pigpio/examples.html)
    exec(cputemp, function(error, responseBody, stderr) {
      if (error !== null) {
        this.log('cputemp function failed: ' + error);
        callback(error);
      } else {
        // cputemp output Format:
        // 41 C
        // The parseFloat() function parses a string and returns a floating point number.This function 
        // determines if the first character in the specified string is a number. If it is, it parses 
        // the string until it reaches the end of the number, and returns the number as a number, not 
        // as a string.
        // # Only the first number in the string is returned!
        // # Leading and trailing spaces are allowed.
        // # If the first character cannot be converted to a number, parseFloat() returns NaN.
        var CPUTemperature = parseFloat(responseBody);
        this.log("CPU Temperature : %s", CPUTemperature);
        callback(null, CPUTemperature);
      }
    }.bind(this));
  },

  // identify: This is a function called when the user clicks on "identify device" in the iOS app during bridge setup
  identify: function(callback) {
    this.log(this.name, "Identify requested!");
    callback(); // success
  },


  getServices: function() {
    this.log("INIT: %s", this.name);

    // customize Service "Accessory Information"
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "yz88")
      .setCharacteristic(Characteristic.Model, this.service)
      .setCharacteristic(Characteristic.SerialNumber, hostname+"-"+this.name)
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);

    // switch statement to selcet type 
    // # Temperature for temperature only
    // # dht22 for temperature and humidity
    switch (this.service) {
      case "Temperature":
        // create a new service from HAP-NodeJS TemperatureSensor template
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js      
        this.temperatureService = new Service.TemperatureSensor(this.name);
        this.temperatureService
          // getCharacteristic searches for a name or template to match an existing service and returns it as object. So we can now access its methods and properties
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100,
            maxValue: 100
          });
          // })
          // Add an event listener to the 'get' event of the characteristic. This 'get' event is called if iOS wants to get a value, 
          // or if a method called 'getValue' is called in homebridge. The callback passed to the event listener is called if the event happens.
          // As it is called from outside this object, we have to ensure that 'this' references to the current 'this' which is the instance of 
          // the accessory. To achieve that we 'bind' the function (actually a new copy of the function) to the current 'this'.
          // .on('get', this.getTemperature.bind(this));

        setInterval(function() {
          this.getTemperature(function(err, temp) {
            if (err)
              temp = err;
            this.temperatureService
              .getCharacteristic(Characteristic.CurrentTemperature).updateValue(temp);
          }.bind(this));
        }.bind(this), this.refresh * 1000);

        return [informationService, this.temperatureService];

      case "dht22":
        // create a new service from HAP-NodeJS TemperatureSensor template
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js 
        this.dhtService = new Service.TemperatureSensor(this.name_temperature);
        this.dhtService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100,
            maxValue: 100
          });

        // create a new service from HAP-NodeJS HumiditySensor template
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js 
        this.humidityService = new Service.HumiditySensor(this.name_humidity);
        this.humidityService
          // getCharacteristic searches for a name or template to match an existing service and returns it as object. So we can now access its methods and properties
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .setProps({
            minValue: 0,
            maxValue: 100
          });
        // function to peridically read temperature from sensor
        // first read after refresh rate
        setInterval(function() {
          this.getDHTTemperature(function(err, temp, humi) {
            if (err) {
              temp = err;
              humi = err;
            }
            this.dhtService
              .getCharacteristic(Characteristic.CurrentTemperature).updateValue(temp);
            this.humidityService
              .getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(humi);
          }.bind(this));
        }.bind(this), this.refresh * 1000);

        return [this.dhtService, informationService, this.humidityService];
    }
  }
};
