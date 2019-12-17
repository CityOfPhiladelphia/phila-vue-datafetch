
const config = {
  router: {
    enabled: false,
  },
  map: {
    featureLayers: {
      dorParcels: {
        url: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/DOR_Parcel/FeatureServer/0',
      },
      pwdParcels: {
        url: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/PWD_PARCELS/FeatureServer/0',
      },
    },
  },
  geocoder: {
    url: function (input) {
      var inputEncoded = encodeURIComponent(input);
      // return 'http://api.phila.gov/ais/v1/search/943%20sigel?gatekeeperKey=82fe014b6575b8c38b44235580bc8b11&include_units=true%27';
      return 'http://api.phila.gov/ais/v1/search/' + inputEncoded;
    },
    params: {
      gatekeeperKey: '82fe014b6575b8c38b44235580bc8b11',
      include_units: true,
    },
    // proxy: {
    //   host: 'proxy.phila.gov',
    //   port: 8080,
    // },
  },
  parcels: {
    pwd: {
      multipleAllowed: false,
      mapregStuff: false,
      geocodeFailAttemptParcel: null,
      clearStateOnError: false,
      wipeOutOtherParcelsOnReverseGeocodeOnly: true,
      geocodeField: 'PARCELID',
      parcelIdInGeocoder: 'pwd_parcel_id',
      getByLatLngIfIdFails: false,
    },
    dor: {
      multipleAllowed: true,
      mapregStuff: true,
      geocodeFailAttemptParcel: 'pwd',
      clearStateOnError: true,
      wipeOutOtherParcelsOnReverseGeocodeOnly: false,
      geocodeField: 'MAPREG',
      parcelIdInGeocoder: 'dor_parcel_id',
      getByLatLngIfIdFails: true,
    },
  },
  dataSources: {
    opa: {
      type: 'http-get',
      url: 'https://data.phila.gov/resource/w7rb-qrn8.json',
      options: {
        params: {
          parcel_number: function(feature) {
            return feature.properties.opa_account_num;
          },
        },
        success: function(data) {
          return data[0];
        },
      },
    },
    liPermits: {
      type: 'http-get',
      url: 'https://phl.carto.com/api/v2/sql',
      options: {
        params: {
          q: function(feature){
            return "select * from li_permits where address = '" + feature.properties.street_address + "' or addresskey = '" + feature.properties.li_address_key.toString() + "'";
          },
        },
      },
    },
  },
};

export default config;
