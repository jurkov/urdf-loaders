/* globals */
import * as THREE from 'three';
import { registerDragEvents } from './dragAndDrop.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import URDFManipulator from '../../src/urdf-manipulator-element.js';

customElements.define('urdf-viewer', URDFManipulator);

// declare these globally for the sake of the example.
// Hack to make the build work with webpack for now.
// TODO: Remove this once modules or parcel is being used
const viewer = document.querySelector('urdf-viewer');

const limitsToggle = document.getElementById('ignore-joint-limits');
const collisionToggle = document.getElementById('collision-toggle');
const radiansToggle = document.getElementById('radians-toggle');
const autocenterToggle = document.getElementById('autocenter-toggle');
const upSelect = document.getElementById('up-select');
const sliderList = document.querySelector('#controls ul');
const controlsel = document.getElementById('controls');
const controlsToggle = document.getElementById('toggle-controls');
const animToggle = document.getElementById('do-animate');
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 1 / DEG2RAD;
let sliders = {};
let buffer;
let animation_buffer = [];
let animToggleBufferArray = [];
let current_timestep = 0;

var animations_dat = [
    "Mini_Cheetah/backflip.dat", 
    "Mini_Cheetah/front_jump_data.dat",
    "Mini_Cheetah/front_jump_extend_legs.dat",
    "Mini_Cheetah/front_jump_pitchup.dat",
    "Mini_Cheetah/front_jump_pitchup_v2.dat",
    "Mini_Cheetah/front_jump_pitchup_v2_too_much.dat",
    "Mini_Cheetah/front_jump_v3.dat", 
    "Mini_Cheetah/front_jump_v4.dat", 
    "Mini_Cheetah/front_jump_v5.dat",
]

// Global Functions
const setColor = color => {

    document.body.style.backgroundColor = color;
    viewer.highlightColor = '#' + (new THREE.Color(0xffffff)).lerp(new THREE.Color(color), 0.35).getHexString();

};

// Events
// toggle checkbox
limitsToggle.addEventListener('click', () => {
    limitsToggle.classList.toggle('checked');
    viewer.ignoreLimits = limitsToggle.classList.contains('checked');
});

radiansToggle.addEventListener('click', () => {
    radiansToggle.classList.toggle('checked');
    Object
        .values(sliders)
        .forEach(sl => sl.update());
});

collisionToggle.addEventListener('click', () => {
    collisionToggle.classList.toggle('checked');
    viewer.showCollision = collisionToggle.classList.contains('checked');
});

autocenterToggle.addEventListener('click', () => {
    autocenterToggle.classList.toggle('checked');
    viewer.noAutoRecenter = !autocenterToggle.classList.contains('checked');
});

upSelect.addEventListener('change', () => viewer.up = upSelect.value);

controlsToggle.addEventListener('click', () => controlsel.classList.toggle('hidden'));

// watch for urdf changes
viewer.addEventListener('urdf-change', () => {

    Object
        .values(sliders)
        .forEach(sl => sl.remove());
    sliders = {};

});

viewer.addEventListener('ignore-limits-change', () => {

    Object
        .values(sliders)
        .forEach(sl => sl.update());

});

viewer.addEventListener('angle-change', e => {

    if (sliders[e.detail]) sliders[e.detail].update();

});

viewer.addEventListener('joint-mouseover', e => {

    const j = document.querySelector(`li[joint-name="${ e.detail }"]`);
    if (j) j.setAttribute('robot-hovered', true);

});

viewer.addEventListener('joint-mouseout', e => {

    const j = document.querySelector(`li[joint-name="${ e.detail }"]`);
    if (j) j.removeAttribute('robot-hovered');

});

let originalNoAutoRecenter;
viewer.addEventListener('manipulate-start', e => {

    const j = document.querySelector(`li[joint-name="${ e.detail }"]`);
    if (j) {
        j.scrollIntoView({ block: 'nearest' });
        window.scrollTo(0, 0);
    }

    originalNoAutoRecenter = viewer.noAutoRecenter;
    viewer.noAutoRecenter = true;

});

viewer.addEventListener('manipulate-end', e => {

    viewer.noAutoRecenter = originalNoAutoRecenter;

});

// create the sliders
viewer.addEventListener('urdf-processed', () => {

    const r = viewer.robot;
    Object
        .keys(r.joints)
        .sort((a, b) => {

            const da = a.split(/[^\d]+/g).filter(v => !!v).pop();
            const db = b.split(/[^\d]+/g).filter(v => !!v).pop();

            if (da !== undefined && db !== undefined) {
                const delta = parseFloat(da) - parseFloat(db);
                if (delta !== 0) return delta;
            }

            if (a > b) return 1;
            if (b > a) return -1;
            return 0;

        })
        .map(key => r.joints[key])
        .forEach(joint => {

            const li = document.createElement('li');
            li.innerHTML =
            `
            <span title="${ joint.name }">${ joint.name }</span>
            <input type="range" value="0" step="0.0001"/>
            <input type="number" step="0.0001" />
            `;
            li.setAttribute('joint-type', joint.jointType);
            li.setAttribute('joint-name', joint.name);

            sliderList.appendChild(li);

            // update the joint display
            const slider = li.querySelector('input[type="range"]');
            const input = li.querySelector('input[type="number"]');
            li.update = () => {
                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                let angle = joint.angle;

                if (joint.jointType === 'revolute' || joint.jointType === 'continuous') {
                    angle *= degMultiplier;
                }

                if (Math.abs(angle) > 1) {
                    angle = angle.toFixed(1);
                } else {
                    angle = angle.toPrecision(2);
                }

                input.value = parseFloat(angle);

                // directly input the value
                slider.value = joint.angle;

                if (viewer.ignoreLimits || joint.jointType === 'continuous') {
                    slider.min = -6.28;
                    slider.max = 6.28;

                    input.min = -6.28 * degMultiplier;
                    input.max = 6.28 * degMultiplier;
                } else {
                    slider.min = joint.limit.lower;
                    slider.max = joint.limit.upper;

                    input.min = joint.limit.lower * degMultiplier;
                    input.max = joint.limit.upper * degMultiplier;
                }
            };

            switch (joint.jointType) {

                case 'continuous':
                case 'prismatic':
                case 'revolute':
                    break;
                default:
                    li.update = () => {};
                    input.remove();
                    slider.remove();

            }

            slider.addEventListener('input', () => {
                viewer.setJointValue(joint.name, slider.value);
                li.update();
            });

            input.addEventListener('change', () => {
                const degMultiplier = radiansToggle.classList.contains('checked') ? 1.0 : RAD2DEG;
                viewer.setJointValue(joint.name, input.value * degMultiplier);
                li.update();
            });

            li.update();

            sliders[joint.name] = li;

        });

});

document.addEventListener('WebComponentsReady', () => {

    viewer.loadMeshFunc = (path, manager, done) => {

        const ext = path.split(/\./g).pop().toLowerCase();
        switch (ext) {

            case 'gltf':
            case 'glb':
                new GLTFLoader(manager).load(
                    path,
                    result => done(result.scene),
                    null,
                    err => done(null, err),
                );
                break;
            case 'obj':
                new OBJLoader(manager).load(
                    path,
                    result => done(result),
                    null,
                    err => done(null, err),
                );
                break;
            case 'dae':
                new ColladaLoader(manager).load(
                    path,
                    result => done(result.scene),
                    null,
                    err => done(null, err),
                );
                break;
            case 'stl':
                new STLLoader(manager).load(
                    path,
                    result => {
                        const material = new THREE.MeshPhongMaterial();
                        const mesh = new THREE.Mesh(result, material);
                        done(mesh);
                    },
                    null,
                    err => done(null, err),
                );
                break;

        }

    };

    document.querySelector('li[urdf]').dispatchEvent(new Event('click'));

    if (/javascript\/example\/bundle/i.test(window.location)) {
        viewer.package = '../../../urdf';
    }

    registerDragEvents(viewer, () => {
        setColor('#263238');
        animToggle.classList.remove('checked');
        updateList();
    });

});

// init 2D UI and animation
const updateAngles = () => {

    if (!viewer.setJointValue) return;

    // reset everything to 0 first
    const resetJointValues = viewer.angles;
    for (const name in resetJointValues) resetJointValues[name] = 0;
    viewer.setJointValues(resetJointValues);

    if(buffer)
    {
        var plan_timesteps = buffer.byteLength / (4*22);

        function get_plan_at_time(timestep)
        {
            //console.log(timestep)
            if(timestep < 0) {
                console.log("Timesteps is too low, not allowed.")
            }

            if(timestep > plan_timesteps -1) {
                console.log("Timesteps is too high, not allowed.")
            }
            
            return new Float32Array(buffer, timestep * 22*4, 22);
        }

        function set_robot_joint_rotation(step) {
            if(viewer.robot)
            {
                viewer.robot.rotation.y = step[2];
                //viewer.robot.position.z = step[1];
            }   
            //MIT cheetah
                
            // Front Hip
            viewer.setJointValue(`abduct_fr_to_thigh_fr_j`, step[3]);
            viewer.setJointValue(`abduct_fl_to_thigh_fl_j`, step[3]);
            // Front Knee
            viewer.setJointValue(`thigh_fr_to_knee_fr_j`, step[4]);
            viewer.setJointValue(`thigh_fl_to_knee_fl_j`, step[4]);
            // Hind Hip
            viewer.setJointValue(`abduct_hr_to_thigh_hr_j`, step[5]);
            viewer.setJointValue(`abduct_hl_to_thigh_hl_j`, step[5]);
            // Hind Knee
            viewer.setJointValue(`thigh_hr_to_knee_hr_j`, step[6]);
            viewer.setJointValue(`thigh_hl_to_knee_hl_j`, step[6]);
    
            //A1
    
            // Front Hip
            viewer.setJointValue(`FR_upper_joint`, -step[3]);
            viewer.setJointValue(`FL_upper_joint`, -step[3]);
            // Front Knee
            viewer.setJointValue(`FR_lower_joint`, -step[4]);
            viewer.setJointValue(`FL_lower_joint`, -step[4]);
            // Hind Hip
            viewer.setJointValue(`RR_upper_joint`, -step[5]);
            viewer.setJointValue(`RL_upper_joint`, -step[5]);
            // Hind Knee
            viewer.setJointValue(`RR_lower_joint`, -step[6]);
            viewer.setJointValue(`RL_lower_joint`, -step[6]);
    
            //Go1
    
            // Front Hip
            viewer.setJointValue(`FR_thigh_joint`, -step[3]);
            viewer.setJointValue(`FL_thigh_joint`, -step[3]);
            // Front Knee
            viewer.setJointValue(`FR_calf_joint`, -step[4]);
            viewer.setJointValue(`FL_calf_joint`, -step[4]);
            // Hind Hip
            viewer.setJointValue(`RR_thigh_joint`, -step[5]);
            viewer.setJointValue(`RL_thigh_joint`, -step[5]);
            // Hind Knee
            viewer.setJointValue(`RR_calf_joint`, -step[6]);
            viewer.setJointValue(`RL_calf_joint`, -step[6]);
        }

        if(current_timestep>=plan_timesteps+100) {
            current_timestep=0;
        }

        if(current_timestep<plan_timesteps) {
            var current_step = get_plan_at_time(current_timestep)
    
            /*
            var tau_mult = 1.2;
            var q_des_front = new THREE.Vector3( 0.0, current_step[3], current_step[4]);
            var q_des_rear = new THREE.Vector3( 0.0, current_step[5], current_step[6]);
            var qd_des_front = new THREE.Vector3( 0.0, current_step[10], current_step[11]);
            var qd_des_rear  = new THREE.Vector3( 0,0, current_step[12], current_step[13]);
            var tau_front = new THREE.Vector3( 0.0, tau_mult * current_step[14+0] / 2.0, tau_mult * current_step[14+1] / 2.0);
            var tau_rear = new THREE.Vector3( 0.0, tau_mult * current_step[14+2] / 2.0, tau_mult * current_step[14+3] / 2.0 );
            */
    
            //console.log(current_step[0], current_step[0] / DEG2RAD)
            //console.log(current_step[1], current_step[1] / DEG2RAD)
            //console.log(current_step[2], current_step[2] / DEG2RAD)

            //console.log(current_step[0], current_step[0] / DEG2RAD, current_step[1], current_step[1] / DEG2RAD);
            
            //console.log(current_step[18], current_step[18] / DEG2RAD)
            //console.log(current_step[19], current_step[19] / DEG2RAD)
            //console.log(current_step[20], current_step[20] / DEG2RAD)
            //console.log(current_step[21], current_step[21] / DEG2RAD)

            set_robot_joint_rotation(current_step);
        }
        else {
            var current_step_first = get_plan_at_time(0);
            var current_step_last = get_plan_at_time(plan_timesteps-1);

            var ratio = (current_timestep-plan_timesteps) / 100;
            var between_step = new Float32Array(22);

            between_step[2] = current_step_last[2];
            between_step[3] = THREE.MathUtils.lerp(current_step_last[3], current_step_first[3], ratio);
            between_step[4] = THREE.MathUtils.lerp(current_step_last[4], current_step_first[4], ratio);

            between_step[5] = THREE.MathUtils.lerp(current_step_last[5], current_step_first[5], ratio);
            between_step[6] = THREE.MathUtils.lerp(current_step_last[6], current_step_first[6], ratio);

            set_robot_joint_rotation(between_step);
        }
        current_timestep++;
    }
};

const updateLoop = () => {
    animations_dat.forEach((dat) => {
        if(animToggleBufferArray[dat]) {
            if (animToggleBufferArray[dat].classList.contains('checked')) {
                buffer = animation_buffer[dat];
            }
        }
    });


    if (animToggle.classList.contains('checked')) {
        updateAngles();
    }
    

    requestAnimationFrame(updateLoop);

};

const updateList = () => {

    document.querySelectorAll('#urdf-options li[urdf]').forEach(el => {

        el.addEventListener('click', e => {

            const urdf = e.target.getAttribute('urdf');
            const color = e.target.getAttribute('color');

            viewer.up = '+Z';
            document.getElementById('up-select').value = viewer.up;
            viewer.urdf = urdf;
            animToggle.classList.add('checked');
            setColor(color);

        });

    });

};

updateList();

document.addEventListener('WebComponentsReady', () => {

    animToggle.addEventListener('click', () => animToggle.classList.toggle('checked'));

    // stop the animation if user tried to manipulate the model
    viewer.addEventListener('manipulate-start', e => animToggle.classList.remove('checked'));
    viewer.addEventListener('urdf-processed', e => updateAngles());
    updateLoop();
    viewer.camera.position.set(0.0, 0.15, 0.7);

});

function toggle_all_buffer(toggle_on) {
    animations_dat.forEach((dat) => {
        animToggleBufferArray[dat].classList.remove('checked');
    });

    toggle_on.classList.toggle('checked');
}

animations_dat.forEach((dat) => {
    //console.log(dat);
    const loader = new THREE.FileLoader();

    loader.setResponseType( 'arraybuffer' ).load(
        // resource URL
        '../../../urdf/' + dat,
    
        // onLoad callback
        function ( buffer_load ) {
            console.log("Loaded " + dat)
            console.log(buffer_load.byteLength);
            console.log(buffer_load.byteLength / (4*22));

            animation_buffer[dat] = buffer_load;
            buffer = animation_buffer[dat];
        },
    
        // onProgress callback
        function ( xhr ) {
            console.log( (xhr.loaded / xhr.total * 100) + '% loaded' );
        },
    
        // onError callback
        function ( err ) {
            console.error( 'An error happened' );
        }
    );

    document.addEventListener('WebComponentsReady', () => {
        const newDiv = document.createElement("div");
        newDiv.setAttribute("id", dat);
        newDiv.setAttribute("class", "toggle");
        const newContent = document.createTextNode("Animation " + dat);
        newDiv.appendChild(newContent);
        var referenceNode = document.querySelector('#do-animate');
        referenceNode.after(newDiv);

        animToggleBufferArray[dat] = document.getElementById(dat); 
        animToggleBufferArray[dat].addEventListener('click', () => toggle_all_buffer(animToggleBufferArray[dat]));
    });
});