// ruleid: react-component-options-param
function Panel(props: { title: string }, options = {}) {
  return <section>{props.title}</section>;
}
// ruleid: react-component-options-param
const Card = (props, options) => <article />;
// ruleid: react-component-options-param
const Badge = (props, options = {}) => {
  return <><span /></>;
};
// ruleid: react-component-options-param
const Notice = function(props, options) { return <aside />; };
// ok: react-component-options-param
function SingleProps({ options }: { options: object }) { return <div />; }
// ok: react-component-options-param
function buildPanel(input, options = {}) { return <div />; }
// ok: react-component-options-param
function ParseValue(input, options = {}) { return JSON.parse(input); }
// ok: react-component-options-param
const Empty = (props, options) => null;
